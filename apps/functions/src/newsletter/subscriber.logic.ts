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

export type MatchDecision =
  | { kind: 'existing'; personKey: string; nameDiffers: boolean }
  | { kind: 'create' }
  | { kind: 'ambiguous'; personKeys: string[] };

const squash = (s: string): string => (s ?? '').replace(/\s+/g, '').toLowerCase();

/** Two names are the same when first and last name are equal ignoring case and whitespace. */
export function sameName(a: PersonName, b: PersonName): boolean {
  return squash(a.firstName) === squash(b.firstName) && squash(a.lastName) === squash(b.lastName);
}

/**
 * Which person a confirmed sign-up belongs to (§5.3 steps 2–4): none → create one; one person → that
 * one; several → the one where the email is the favourite; still several (or none of them) → ambiguous,
 * an admin decides. Several addresses of one person count as one person.
 */
export function decideMatch(candidates: MatchCandidate[], typed: PersonName): MatchDecision {
  const persons = new Map<string, MatchCandidate>();
  for (const c of candidates) {
    const seen = persons.get(c.personKey);
    persons.set(c.personKey, seen ? { ...seen, isFavorite: seen.isFavorite || c.isFavorite } : c);
  }
  const all = [...persons.values()];
  if (all.length === 0) return { kind: 'create' };
  const favorites = all.filter((p) => p.isFavorite);
  const chosen = all.length === 1 ? all[0] : favorites.length === 1 ? favorites[0] : undefined;
  if (!chosen) return { kind: 'ambiguous', personKeys: all.map((p) => p.personKey) };
  return { kind: 'existing', personKey: chosen.personKey, nameDiffers: !sameName(chosen, typed) };
}

// ---------------------------------------------------------------------------------------------
// tasks for the member admins — names only, never an address
// ---------------------------------------------------------------------------------------------

export type SubscriberTaskKind = 'nameDiffers' | 'ambiguous';

export const NAME_DIFFERS_TASK_NAME = 'Newsletter-Anmeldung: Name weicht ab';
export const AMBIGUOUS_TASK_NAME = 'Newsletter-Anmeldung zuordnen';
export const NEWSLETTER_TASK_TAG = 'newsletter';

export function nameDiffersTaskNotes(typedName: string, personName: string, groupName: string): string {
  return [
    `Bei der Anmeldung zum Newsletter ${groupName} wurde der Name «${typedName}» eingegeben.`,
    `Die Person mit dieser E-Mail-Adresse heisst «${personName}».`,
    'Prüfe, ob der Name angepasst werden soll. Die Anmeldung gilt für die bestehende Person.',
  ].join('\n');
}

export function ambiguousTaskNotes(typedName: string, candidateNames: string[], groupName: string): string {
  return [
    `Bei der Anmeldung zum Newsletter ${groupName} wurde der Name «${typedName}» eingegeben.`,
    `Mehrere Personen haben diese E-Mail-Adresse: ${candidateNames.join(', ')}.`,
    'Ordne die Anmeldung von Hand der richtigen Person zu.',
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
