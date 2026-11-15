import { VcardImportDecision } from './vcard-import-matching';

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
