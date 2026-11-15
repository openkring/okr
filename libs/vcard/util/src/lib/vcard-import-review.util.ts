import { normalizeName, VcardImportDecision } from './vcard-import-matching';

/** The filter chips of the import review (spec 1.159 §4.2). */
export type ReviewFilter = 'all' | 'new' | 'duplicates' | 'warnings';
export const REVIEW_FILTERS: ReviewFilter[] = ['all', 'new', 'duplicates', 'warnings'];

/** A card that matched an existing person or org (or an earlier card of the batch). */
export function isDuplicateDecision(d: VcardImportDecision): boolean {
  return d.duplicates.length > 0 || d.orgDuplicates.length > 0;
}

function matches(d: VcardImportDecision, filter: ReviewFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'new': return !isDuplicateDecision(d);
    case 'duplicates': return isDuplicateDecision(d);
    case 'warnings': return d.draft.warnings.length > 0;
  }
}

/** Indices (into `decisions`) of the rows a filter shows, in file order. */
export function filterIndices(decisions: VcardImportDecision[], filter: ReviewFilter): number[] {
  const out: number[] = [];
  decisions.forEach((d, i) => { if (matches(d, filter)) out.push(i); });
  return out;
}

export function filterCounts(decisions: VcardImportDecision[]): Record<ReviewFilter, number> {
  const counts: Record<ReviewFilter, number> = { all: 0, new: 0, duplicates: 0, warnings: 0 };
  for (const d of decisions) for (const f of REVIEW_FILTERS) if (matches(d, f)) counts[f]++;
  return counts;
}

/**
 * Set one action on the given rows; a new array, rows outside `indices` untouched.
 * `merge` only applies to duplicates; `import` on a duplicate means «create anyway».
 */
export function applyBulkAction(decisions: VcardImportDecision[], indices: number[], action: 'import' | 'merge' | 'skip'): VcardImportDecision[] {
  const target = new Set(indices);
  return decisions.map((d, i) => {
    if (!target.has(i)) return d;
    const dup = isDuplicateDecision(d);
    if (action === 'merge') return dup ? { ...d, action: 'merge' } : d;
    if (action === 'import') return { ...d, action: dup ? 'createAnyway' : 'import' };
    return { ...d, action: 'skip' };
  });
}

// ---- letter index (spec 1.159 §4.2, owner request 2026-11-15) ----

export const INDEX_LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

/** What a card is filed under: a person by last name (else first name), an org by its name. */
function sortKey(d: VcardImportDecision): string {
  const draft = d.draft;
  if (draft.kind === 'org') return normalizeName(draft.org?.name || draft.displayName);
  const last = draft.person?.lastName ?? '';
  const first = draft.person?.firstName ?? '';
  return normalizeName(last ? `${last} ${first}` : first || draft.displayName);
}

/** The index letter of a card: A–Z (umlauts under their base letter), else '#'. */
export function letterOf(d: VcardImportDecision): string {
  const c = sortKey(d).charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/** Rows per letter among `indices` — every letter A–Z plus '#', in that order. */
export function letterCounts(decisions: VcardImportDecision[], indices: number[]): { letter: string; count: number }[] {
  const counts = new Map(INDEX_LETTERS.map((l) => [l, 0]));
  for (const i of indices) {
    const l = letterOf(decisions[i]);
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return INDEX_LETTERS.map((letter) => ({ letter, count: counts.get(letter) ?? 0 }));
}

/** The rows of one letter among `indices`, sorted by name. */
export function rowsOfLetter(decisions: VcardImportDecision[], indices: number[], letter: string): number[] {
  return indices
    .filter((i) => letterOf(decisions[i]) === letter)
    .sort((a, b) => sortKey(decisions[a]).localeCompare(sortKey(decisions[b])));
}

/** The first letter with at least one row ('A' when there are none). */
export function firstLetterWithRows(counts: { letter: string; count: number }[]): string {
  return counts.find((c) => c.count > 0)?.letter ?? 'A';
}
