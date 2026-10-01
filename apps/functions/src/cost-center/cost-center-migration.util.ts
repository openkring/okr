import { CostCenterLike, isActiveLeafCostCenter } from '@okr/shared-util-core';

type Named = CostCenterLike & { id?: string; name?: string };

/** Free-text Kostenstelle (spec 1.65 §6.4.1) → okey of an active leaf, or '' when nothing matches. */
export function matchCostCenterText(value: string, centers: Named[], accountingTenantId: string): string {
  const text = (value ?? '').trim();
  if (!text) return '';
  if (isActiveLeafCostCenter(text, accountingTenantId, centers)) return text;
  const lower = text.toLowerCase();
  const hit = centers.find(c => isActiveLeafCostCenter(c.okey, accountingTenantId, centers)
    && ((c.id ?? '').trim().toLowerCase() === lower || (c.name ?? '').trim().toLowerCase() === lower));
  return hit?.okey ?? '';
}

export type FreeTextDecision =
  | { action: 'skip' | 'keep' | 'clear' | 'unattributed' }
  | { action: 'rewrite'; newValue: string };

/**
 * What the free-text step does with one document value. A tenant may hold several sets of books,
 * so a value is only ever cleared when the document provably belongs to the chosen book:
 * - the okey of ANY cost centre of the tenant (any book, archived or not) is kept;
 * - a document of another book is skipped;
 * - a document without a book (`docBook` empty/undefined) is `unattributed`: listed, never touched;
 * - otherwise a match is rewritten to the okey, no match is cleared.
 */
export function decideFreeText(value: string, docBook: string | undefined, accountingTenantId: string, centersOfBook: Named[], allTenantCenterKeys: Set<string>): FreeTextDecision {
  const text = (value ?? '').trim();
  if (!text) return { action: 'skip' };
  if (allTenantCenterKeys.has(text)) return { action: 'keep' };
  if (!docBook) return { action: 'unattributed' };
  if (docBook !== accountingTenantId) return { action: 'skip' };
  const matched = matchCostCenterText(text, centersOfBook, accountingTenantId);
  if (matched === '') return { action: 'clear' };
  return matched === value ? { action: 'keep' } : { action: 'rewrite', newValue: matched };
}

/** The set of books a document belongs to: its own non-empty `accountingTenantId`, else the book of its account, else unknown. */
export function bookOfDoc(ownBook: string | undefined, accountKey: string | undefined, accountBook: Map<string, string>): string | undefined {
  const own = (ownBook ?? '').trim();
  if (own) return own;
  const key = (accountKey ?? '').trim();
  return key ? accountBook.get(key) || undefined : undefined;
}
