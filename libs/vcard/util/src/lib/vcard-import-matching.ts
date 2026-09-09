import { VcardImportDraft } from './vcard-import-mapping';

/** A person already in the tenant, as needed for duplicate/relation matching. */
export interface ExistingPerson {
  okey: string;
  firstName: string;
  lastName: string;
  emails: string[];
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

function findDuplicates(draft: VcardImportDraft, persons: ExistingPerson[]): ExistingPerson[] {
  // An org card is never a duplicate OF A PERSON. Without this an org sharing a generic
  // address (info@acme.ch) with one of its people would match on email and be handed the
  // person merge path, which writes `person.<okey>` addresses and a dob vault doc for it.
  if (draft.kind === 'org') return [];
  const emails = draftEmails(draft);
  if (emails.length > 0) {
    const byEmail = persons.filter((p) => p.emails.some((e) => emails.includes(e.toLowerCase().trim())));
    if (byEmail.length > 0) return byEmail;
  }
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
  const decisions: VcardImportDecision[] = [];

  for (const draft of drafts) {
    const duplicates = findDuplicates(draft, pool);
    const orgDuplicates = findOrgDuplicates(draft, orgPool);
    const action: VcardImportDecision['action'] = duplicates.length > 0 || orgDuplicates.length > 0 ? 'merge' : 'import';
    const { employerKey, createEmployer, employerCandidates } = resolveEmployer(draft, orgs);
    const relations = resolveRelations(draft, pool);

    decisions.push({ draft, duplicates, orgDuplicates, action, employerKey, createEmployer, employerCandidates, relations });

    // Fold this card's own name into the pool (§5.4) without an okey, so a later
    // card can be recognized as duplicating it by name, while relation matching
    // against it (which requires an okey) still comes back unresolved.
    if (draft.kind === 'person' && draft.person) {
      pool.push({ okey: '', firstName: draft.person.firstName ?? '', lastName: draft.person.lastName ?? '', emails: draftEmails(draft) });
    } else if (draft.kind === 'org' && draft.org) {
      // the same org twice in one file is recognised the same way (okey-less, so the commit
      // creates it once and the second card reuses the batch key rather than a merge target).
      orgPool.push({ okey: '', name: draft.org.name ?? draft.displayName });
    }
  }

  return decisions;
}
