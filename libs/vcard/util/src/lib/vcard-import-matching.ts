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
  duplicates: ExistingPerson[];
  action: 'import' | DuplicateAction;
  /** resolved org key for the employment edge, '' = do not link */
  employerKey: string;
  createEmployer: boolean;
  employerCandidates: ExistingOrg[];
  relations: { name: string; label: string; personKey: string; createPerson: boolean; candidates: ExistingPerson[] }[];
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
  const emails = draftEmails(draft);
  if (emails.length > 0) {
    const byEmail = persons.filter((p) => p.emails.some((e) => emails.includes(e.toLowerCase().trim())));
    if (byEmail.length > 0) return byEmail;
  }
  const draftName = normalizeName(`${draft.person?.firstName ?? ''} ${draft.person?.lastName ?? ''}`);
  return persons.filter((p) => normalizeName(`${p.firstName} ${p.lastName}`) === draftName);
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
  return draft.relatedNames.map(({ name, label }) => {
    const target = normalizeName(name);
    const candidates = persons.filter((p) => normalizeName(`${p.firstName} ${p.lastName}`) === target);
    if (candidates.length === 1) {
      return { name, label, personKey: candidates[0].okey, createPerson: false, candidates: [] };
    }
    return { name, label, personKey: '', createPerson: false, candidates: candidates.length > 1 ? candidates : [] };
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
  const decisions: VcardImportDecision[] = [];

  for (const draft of drafts) {
    const duplicates = findDuplicates(draft, pool);
    const action: VcardImportDecision['action'] = duplicates.length > 0 ? 'merge' : 'import';
    const { employerKey, createEmployer, employerCandidates } = resolveEmployer(draft, orgs);
    const relations = resolveRelations(draft, pool);

    decisions.push({ draft, duplicates, action, employerKey, createEmployer, employerCandidates, relations });

    // Fold this card's own name into the pool (§5.4) without an okey, so a later
    // card can be recognized as duplicating it by name, while relation matching
    // against it (which requires an okey) still comes back unresolved.
    if (draft.kind === 'person' && draft.person) {
      pool.push({ okey: '', firstName: draft.person.firstName ?? '', lastName: draft.person.lastName ?? '', emails: draftEmails(draft) });
    }
  }

  return decisions;
}
