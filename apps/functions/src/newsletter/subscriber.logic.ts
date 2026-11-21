/**
 * Match-or-create for newsletter subscribers (spec 1.169 §5.3): the pure decisions and texts. The
 * Firestore side lives in `subscriber.ts`.
 */
import { createHash } from 'node:crypto';

/** The form of an email address that is stored and matched: trimmed and lowercased. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface PersonName {
  firstName: string;
  lastName: string;
}

/** One address of the tenant with the email, and the name of the person it belongs to. */
export interface MatchCandidate extends PersonName {
  personKey: string;
  /** whether this address is the person's favourite email */
  isFavorite: boolean;
}

/**
 * `existing` with `duplicateKeys`: several persons of the tenant carry the email and the typed name — the chosen one
 * gets the subscription, the member admins check the duplicates. `create` with `sharedWith`: several persons carry
 * the email but none the typed name — a shared mailbox, so a new person is created and the admins are told.
 */
export type MatchDecision =
  | { kind: 'existing'; personKey: string; nameDiffers: boolean; duplicateKeys?: string[] }
  | { kind: 'create'; sharedWith?: string[] };

const squash = (s: string): string => (s ?? '').replace(/\s+/g, '').toLowerCase();

/** Two names are the same when first and last name are equal ignoring case and whitespace. */
export function sameName(a: PersonName, b: PersonName): boolean {
  return squash(a.firstName) === squash(b.firstName) && squash(a.lastName) === squash(b.lastName);
}

/**
 * Which person a confirmed sign-up belongs to (§5.3 steps 2–4, revised 2026-11-21): none → create one; one person
 * → that one (a different name only raises a task). Several persons: exactly one with the typed name → that one;
 * none with the typed name → a new person (shared mailbox); several with the typed name → the one where the email
 * is the favourite, else the lowest person key (possible duplicates). A sign-up is never dropped. Several addresses
 * of one person count as one person.
 */
export function decideMatch(candidates: MatchCandidate[], typed: PersonName): MatchDecision {
  const persons = new Map<string, MatchCandidate>();
  for (const c of candidates) {
    const seen = persons.get(c.personKey);
    persons.set(c.personKey, seen ? { ...seen, isFavorite: seen.isFavorite || c.isFavorite } : c);
  }
  const all = [...persons.values()];
  if (all.length === 0) return { kind: 'create' };
  if (all.length === 1) return { kind: 'existing', personKey: all[0].personKey, nameDiffers: !sameName(all[0], typed) };
  const named = all.filter((p) => sameName(p, typed));
  if (named.length === 0) return { kind: 'create', sharedWith: all.map((p) => p.personKey).sort() };
  if (named.length === 1) return { kind: 'existing', personKey: named[0].personKey, nameDiffers: false };
  const ranked = [...named].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || (a.personKey < b.personKey ? -1 : 1));
  return { kind: 'existing', personKey: ranked[0].personKey, nameDiffers: false, duplicateKeys: named.map((p) => p.personKey).sort() };
}

// ---------------------------------------------------------------------------------------------
// tasks for the member admins — names only, never an address
// ---------------------------------------------------------------------------------------------

export type SubscriberTaskKind = 'nameDiffers' | 'sharedEmail' | 'duplicates';

export const NAME_DIFFERS_TASK_NAME = 'Newsletter-Anmeldung: Name weicht ab';
export const SHARED_EMAIL_TASK_NAME = 'Newsletter-Anmeldung: geteilte E-Mail-Adresse';
export const DUPLICATES_TASK_NAME = 'Newsletter-Anmeldung: mögliche Duplikate';
export const NEWSLETTER_TASK_TAG = 'newsletter';

export function nameDiffersTaskNotes(typedName: string, personName: string, groupName: string): string {
  return [
    `Bei der Anmeldung zum Newsletter ${groupName} wurde der Name «${typedName}» eingegeben.`,
    `Die Person mit dieser E-Mail-Adresse heisst «${personName}».`,
    'Prüfe, ob der Name angepasst werden soll. Die Anmeldung gilt für die bestehende Person.',
  ].join('\n');
}

/** Several persons share the email, none has the typed name: a new person was created. Names only. */
export function sharedEmailTaskNotes(typedName: string, otherNames: string[], groupName: string): string {
  return [
    `Bei der Anmeldung zum Newsletter ${groupName} wurde der Name «${typedName}» eingegeben.`,
    `Diese E-Mail-Adresse gehört bereits mehreren Personen: ${otherNames.join(', ')}. Keine davon heisst so.`,
    `Darum wurde «${typedName}» als neue Person erfasst und angemeldet. Prüfe, ob das stimmt.`,
  ].join('\n');
}

/** Several persons share the email and the typed name: the subscription went to one of them. Names only. */
export function duplicatesTaskNotes(typedName: string, candidateNames: string[], groupName: string): string {
  return [
    `Bei der Anmeldung zum Newsletter ${groupName} wurde der Name «${typedName}» eingegeben.`,
    `Mehrere Personen mit diesem Namen haben diese E-Mail-Adresse: ${candidateNames.join(', ')}.`,
    'Die Anmeldung gilt für eine davon. Prüfe, ob es sich um Duplikate handelt, und führe sie zusammen.',
  ].join('\n');
}

/**
 * Deterministic task id per (tenant, newsletter, email, kind, admin): a repeated confirmation or import
 * writes the same id, so `create()` cannot duplicate the task. Hashed — the email never appears in an id.
 */
export function subscriberTaskId(p: { tenantId: string; groupKey: string; email: string; kind: SubscriberTaskKind; adminKey: string }): string {
  const parts = [p.tenantId, p.groupKey, normalizeEmail(p.email), p.kind, p.adminKey];
  return 'newsletter-' + createHash('sha256').update(parts.join('|')).digest('hex').substring(0, 32);
}
