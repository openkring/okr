import { CategoryListModel, FeePositionRule } from '@okr/shared-models';

import { InvoicePositionInput } from './invoice-position.util';

/**
 * «Aus Gebührenplan übernehmen» (spec 1.78): turn the positions of a year's fee schedule into
 * pickable options for one invoice receiver, and a picked option into an invoice position.
 *
 * Unlike the annual member-fee run (`buildPositions`), the flag and rule predicates are NOT
 * evaluated here — picking a position is the treasurer's explicit decision to charge it. Only a
 * category position depends on the receiver: it needs their membership category.
 */

/** category-list name -> category -> price, the same flat shape `FeeContext.categoryLists` uses */
export type CategoryPriceLists = Record<string, Record<string, number>>;

export interface FeePickContext {
  categoryLists: CategoryPriceLists;
  /** the owner org's list (`OrgModel.membershipCategoryKey`), used when a position names none */
  defaultCategoryList: string;
  /** the receiver's membership category in the owner org; undefined = not a member */
  receiverCategory?: string;
}

export interface FeePickOption {
  rule: FeePositionRule;
  /** the resolved amount in CHF */
  amount: number;
  /** set when the option cannot be picked */
  disabledReason?: 'notMember';
  /** the position carries no revenue account — it can be picked, but must be completed */
  missingAccount: boolean;
}

/** Flattens category lists to `listName -> category -> price`; an item without a price counts 0. */
export function toCategoryPriceLists(lists: readonly CategoryListModel[]): CategoryPriceLists {
  const result: CategoryPriceLists = {};
  for (const list of lists) {
    const prices: Record<string, number> = {};
    list.items?.forEach(item => { prices[item.name] = item.price ?? 0; });
    result[list.name] = prices;
  }
  return result;
}

export function feePickOptions(rules: readonly FeePositionRule[], ctx: FeePickContext): FeePickOption[] {
  return rules.map(rule => {
    const missingAccount = !rule.accountKey;
    if (rule.source !== 'category') {
      return { rule, amount: roundChf(rule.amount ?? 0), missingAccount };
    }
    if (!ctx.receiverCategory) {
      return { rule, amount: 0, disabledReason: 'notMember', missingAccount };
    }
    const list = rule.categoryList || ctx.defaultCategoryList;
    const amount = ctx.categoryLists[list]?.[ctx.receiverCategory] ?? 0;
    return { rule, amount: roundChf(amount), missingAccount };
  });
}

/** The invoice position for a picked option — what `writeInvoice` accepts, nothing more. */
export function feeOptionToPosition(option: FeePickOption): InvoicePositionInput {
  return { name: option.rule.label, amount: option.amount, accountKey: option.rule.accountKey ?? '' };
}

/**
 * Adds a picked position to the list. The editor starts a new invoice with one blank row; a
 * pick replaces that blank row instead of leaving an invalid empty position above it.
 */
export function addPickedPosition(positions: readonly InvoicePositionInput[], picked: InvoicePositionInput): InvoicePositionInput[] {
  const blank = positions.findIndex(p => !p.name && !p.amount && !p.accountKey);
  if (blank === -1) return [...positions, picked];
  return positions.map((p, i) => (i === blank ? picked : p));
}

function roundChf(amount: number): number {
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}
