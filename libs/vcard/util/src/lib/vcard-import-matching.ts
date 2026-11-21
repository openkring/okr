import { parsePhoneNumberFromString } from '@okr/shared-util-core';

import { VcardImportDraft } from './vcard-import-mapping';

/** A person already in the tenant, as needed for duplicate/relation matching. */
export interface ExistingPerson {
  okey: string;
  firstName: string;
  lastName: string;
  emails: string[];
  /** every phone of the person as stored (favorite + directory entries), unnormalized */
  phones: string[];
  /** set on a card of the same file (okey ''): its index in `drafts`, so a merge can target it at commit time */
  batchIndex?: number;
}

/** An org already in the tenant, as needed for employer matching. */
export interface ExistingOrg {
  okey: string;
  name: string;
}

export type DuplicateAction = 'merge' | 'skip' | 'createAnyway';

/** The reviewable outcome of matching one parsed card against the tenant (and the batch so far). */
export interface VcardImportDecision {
  draft: VcardImportDraft;
  /** person cards only — an org card is never a duplicate OF A PERSON (see `findDuplicates`). */
  duplicates: ExistingPerson[];
  /** org cards only — the tenant's orgs carrying the same normalized name (§5.2). */
  orgDuplicates: ExistingOrg[];
  action: 'import' | DuplicateAction;
  /** resolved org key for the employment edge, '' = do not link */
  employerKey: string;
  createEmployer: boolean;
  employerCandidates: ExistingOrg[];
  relations: { name: string; label: string; type?: string; personKey: string; createPerson: boolean; candidates: ExistingPerson[] }[];
}

/**
 * Fold a name for comparison: Unicode-decompose, strip combining marks (diacritics),
 * lower-case, and collapse/trim whitespace. `undefined` folds to `''`.
 */
export function normalizeName(v: string | undefined): string {
  if (!v) return '';
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function draftEmails(draft: VcardImportDraft): string[] {
  return draft.addresses
    .filter((a) => a.addressChannel === 'email' && !!a.email)
    .map((a) => a.email.toLowerCase().trim());
}

/**
 * A phone number's E.164 form (`+41791234567`), default country CH, so `079 123 45 67`,
 * `+41791234567` and `0041 79 123 45 67` share one key. Undefined for a value that is not a
 * number: a label ("Zentrale"), a fragment ("+41 44" — two equal fragments would merge two
 * people), or anything the parser rejects.
 */
export function phoneKey(value: string | undefined): string | undefined {
  if (!value || (value.match(/\d/g) ?? []).length < 7) return undefined;
  try {
    return parsePhoneNumberFromString(value, 'CH')?.number || undefined;
  } catch {
    return undefined;
  }
}

/** Two phone numbers are the same line. */
export function phoneMatch(a: string, b: string): boolean {
  const ka = phoneKey(a);
  return !!ka && ka === phoneKey(b);
}

/**
 * The card's numbers that may identify a PERSON: every phone except an office line
 * (`TEL;TYPE=WORK` → usage `work`), which colleagues share — matching on it would merge them.
 */
function draftPhoneKeys(draft: VcardImportDraft): string[] {
  return draft.addresses
    .filter((a) => a.addressChannel === 'phone' && !!a.phone && a.addressUsage !== 'work')
    .map((a) => phoneKey(a.phone))
    .filter((k): k is string => !!k);
}

function draftPhones(draft: VcardImportDraft): string[] {
  return draft.addresses
    .filter((a) => a.addressChannel === 'phone' && !!a.phone && a.addressUsage !== 'work')
    .map((a) => a.phone);
}

/**
 * E.164 → the persons carrying that number, built once (spec 1.159 §4.1). A number held by
 * more than one existing person is a shared line and identifies nobody, so it is dropped.
 */
type PhoneIndex = Map<string, ExistingPerson[]> & { shared?: Set<string> };

function buildPhoneIndex(persons: ExistingPerson[]): PhoneIndex {
  const index: PhoneIndex = new Map();
  index.shared = new Set();
  for (const p of persons) {
    for (const k of new Set(p.phones.map(phoneKey).filter((x): x is string => !!x))) {
      const list = index.get(k);
      if (list) list.push(p);
      else index.set(k, [p]);
    }
  }
  for (const [k, list] of index) {
    if (list.length > 1) {
      index.delete(k);
      index.shared!.add(k);
    }
  }
  return index;
}

/** The first given name, folded and without the dot of an initial: `Hans-Peter` → `hans`, `L.` → `l`. */
function firstToken(firstName: string | undefined): string {
  return normalizeName(firstName).replace(/\./g, ' ').split(/[\s-]+/).find((t) => !!t) ?? '';
}

/**
 * Two first names that cannot be the same person (spec 1.159 §4.1, 2026-11-21): both are given
 * and neither first given name is a prefix of the other. `Beat`/`Anna` conflict; `Beat`/`B.`,
 * `Beat`/`Beat Peter`, `Chris`/`Christoph` and an empty first name do not.
 */
export function firstNamesConflict(a: string | undefined, b: string | undefined): boolean {
  const ta = firstToken(a);
  const tb = firstToken(b);
  if (!ta || !tb) return false;
  return !ta.startsWith(tb) && !tb.startsWith(ta);
}

function findDuplicates(draft: VcardImportDraft, persons: ExistingPerson[], phoneIndex: PhoneIndex): ExistingPerson[] {
  // An org card is never a duplicate OF A PERSON. Without this an org sharing a generic
  // address (info@acme.ch) with one of its people would match on email and be handed the
  // person merge path, which writes `person.<okey>` addresses and a dob vault doc for it.
  if (draft.kind === 'org') return [];
  // An email or a phone identifies a household as often as a person (a family address, the
  // home landline only one member is recorded with yet). It never overrides a clearly
  // different first name — that is how one family member's card was merged into another on 2026-11-15.
  const sameFirstName = (p: ExistingPerson) => !firstNamesConflict(p.firstName, draft.person?.firstName);
  const emails = draftEmails(draft);
  if (emails.length > 0) {
    const byEmail = persons.filter((p) => sameFirstName(p) && p.emails.some((e) => emails.includes(e.toLowerCase().trim())));
    if (byEmail.length > 0) return byEmail;
  }
  // phone rule (spec 1.159 §4.1): between email and name — a caller-lookup list holds many
  // cards with a phone and no email.
  const byPhone = [...new Set(draftPhoneKeys(draft).flatMap((k) => phoneIndex.get(k) ?? []))].filter(sameFirstName);
  if (byPhone.length > 0) return byPhone;
  const draftName = normalizeName(`${draft.person?.firstName ?? ''} ${draft.person?.lastName ?? ''}`);
  return persons.filter((p) => normalizeName(`${p.firstName} ${p.lastName}`) === draftName);
}

/**
 * An org card duplicating an org the tenant already carries (§5.2). Matching is by
 * normalized name against the very pool `resolveEmployer` uses, so "Acme AG" resolves the
 * same way whether it arrives as its own card or as an `ORG:` string — without this the
 * same file imported twice silently produced a second `OrgModel`.
 */
function findOrgDuplicates(draft: VcardImportDraft, orgs: ExistingOrg[]): ExistingOrg[] {
  if (draft.kind !== 'org') return [];
  const target = normalizeName(draft.org?.name ?? draft.displayName);
  if (!target) return [];
  return orgs.filter((o) => normalizeName(o.name) === target);
}

function resolveEmployer(draft: VcardImportDraft, orgs: ExistingOrg[]): { employerKey: string; createEmployer: boolean; employerCandidates: ExistingOrg[] } {
  const orgName = draft.employment?.orgName;
  if (!orgName) return { employerKey: '', createEmployer: false, employerCandidates: [] };
  const target = normalizeName(orgName);
  const candidates = orgs.filter((o) => normalizeName(o.name) === target);
  if (candidates.length === 1) return { employerKey: candidates[0].okey, createEmployer: false, employerCandidates: [] };
  return { employerKey: '', createEmployer: false, employerCandidates: candidates.length > 1 ? candidates : [] };
}

function resolveRelations(draft: VcardImportDraft, persons: ExistingPerson[]): VcardImportDecision['relations'] {
  return draft.relatedNames.map(({ name, label, type }) => {
    const target = normalizeName(name);
    const candidates = persons.filter((p) => normalizeName(`${p.firstName} ${p.lastName}`) === target);
    if (candidates.length === 1) {
      return { name, label, type, personKey: candidates[0].okey, createPerson: false, candidates: [] };
    }
    return { name, label, type, personKey: '', createPerson: false, candidates: candidates.length > 1 ? candidates : [] };
  });
}

/**
 * Decide, for each parsed card in file order, whether it is new or a duplicate of an
 * existing person, and whether its employer and related-person names resolve (spec §5,
 * §7.1–§7.3). Each draft's own name is folded into the person pool as processing
 * proceeds (§5.4) so later cards see earlier ones as candidates for name matching —
 * but a card created earlier in the batch has no `okey` yet, so relation resolution
 * against it still comes back unresolved; the actual key is filled in at commit time
 * against the batch key map (Task 9).
 */
export function buildDecisions(drafts: VcardImportDraft[], persons: ExistingPerson[], orgs: ExistingOrg[]): VcardImportDecision[] {
  const pool = [...persons];
  const orgPool = [...orgs];
  const phoneIndex = buildPhoneIndex(persons);
  const decisions: VcardImportDecision[] = [];

  for (const [batchIndex, draft] of drafts.entries()) {
    const duplicates = findDuplicates(draft, pool, phoneIndex);
    const orgDuplicates = findOrgDuplicates(draft, orgPool);
    const action: VcardImportDecision['action'] = duplicates.length > 0 || orgDuplicates.length > 0 ? 'merge' : 'import';
    const { employerKey, createEmployer, employerCandidates } = resolveEmployer(draft, orgs);
    const relations = resolveRelations(draft, pool);

    decisions.push({ draft, duplicates, orgDuplicates, action, employerKey, createEmployer, employerCandidates, relations });

    // Fold this card's own name into the pool (§5.4) without an okey, so a later
    // card can be recognized as duplicating it by name, while relation matching
    // against it (which requires an okey) still comes back unresolved.
    if (draft.kind === 'person' && draft.person) {
      const entry: ExistingPerson = { okey: '', firstName: draft.person.firstName ?? '', lastName: draft.person.lastName ?? '', emails: draftEmails(draft), phones: draftPhones(draft), batchIndex };
      pool.push(entry);
      // a later card of the file with the same personal number is a duplicate of this one;
      // the first card to carry a number keeps it (a merge target is one person)
      for (const k of draftPhoneKeys(draft)) if (!phoneIndex.has(k) && !phoneIndex.shared?.has(k)) phoneIndex.set(k, [entry]);
    } else if (draft.kind === 'org' && draft.org) {
      // the same org twice in one file is recognised the same way (okey-less, so the commit
      // creates it once and the second card reuses the batch key rather than a merge target).
      orgPool.push({ okey: '', name: draft.org.name ?? draft.displayName });
    }
  }

  return decisions;
}
