import type {
  FeePositionRule, FeeScheduleEntry, MemberFeePosition, MembershipModel,
} from '@okr/shared-models';

/** Everything the derivation needs that is not on the membership itself. */
export interface FeeContext {
  hasLocker: boolean;
  currentYear: number;
  /** category-list name -> category -> price, flattened by the caller from the category lists. */
  categoryLists: Record<string, Record<string, number>>;
  /** the org's own price list (`OrgModel.membershipCategoryKey`), used when a rule names none */
  defaultCategoryList?: string;
}

const FLAGS: Record<string, (m: MembershipModel, ctx: FeeContext) => boolean> = {
  hasLocker: (_m, ctx) => ctx.hasLocker,
};

const RULES: Record<string, (m: MembershipModel, ctx: FeeContext) => boolean> = {
  // Joined this calendar year and older than 25. The previous implementation read `birthYear`
  // out of `dateOfEntry`, which made the age test `0 > 25` and meant the entry fee was never
  // charged to anybody (design §2.3). An unparseable birth year yields NaN and returns false,
  // which keeps the safe, non-charging direction.
  newMemberOver25: (m, ctx) => {
    const entryYear = parseInt(m.dateOfEntry.substring(0, 4), 10);
    const birthYear = parseInt(m.memberBirthYear, 10);
    return entryYear === ctx.currentYear && (ctx.currentYear - birthYear) > 25;
  },
};

function amountOf(rule: FeePositionRule, membership: MembershipModel, ctx: FeeContext): number {
  switch (rule.source) {
    case 'category':
      return ctx.categoryLists[rule.categoryList || ctx.defaultCategoryList || '']?.[membership.category] ?? 0;
    case 'flag':
      return FLAGS[rule.flag ?? '']?.(membership, ctx) ? (rule.amount ?? 0) : 0;
    case 'rule':
      return RULES[rule.rule ?? '']?.(membership, ctx) ? (rule.amount ?? 0) : 0;
    case 'manual':
      return rule.amount ?? 0;
    default:
      return 0;
  }
}

/**
 * Derive one member's fee positions from a year's schedule. Pure: no services, no Firestore.
 * Replaces the hardcoded body of the old `convertMembershipToFee`.
 */
export function buildPositions(
  membership: MembershipModel,
  schedule: FeeScheduleEntry,
  ctx: FeeContext,
): MemberFeePosition[] {
  // `bexioAccountId` is spread in only when the rule carries one: an explicit `undefined` field
  // is rejected by Firestore on write, and an unseeded schedule simply has no Bexio id yet.
  return schedule.positions.map(rule => ({
    key: rule.key,
    usage: rule.usage,
    type: rule.type,
    label: rule.label,
    amount: amountOf(rule, membership, ctx),
    accountKey: rule.accountKey ?? '',
    vatCodeKey: rule.vatCodeKey ?? '',
    ...(rule.bexioAccountId === undefined ? {} : { bexioAccountId: rule.bexioAccountId }),
  }));
}

/**
 * The stored label of a rebate position, per reason. German on purpose: the label becomes the
 * invoice position name and is printed on the invoice as is, so it must be text, not an i18n key.
 * `custom` and an unknown or empty reason fall back to «Rabatt».
 */
export const REBATE_REASON_LABELS: Record<string, string> = {
  edu: 'Ausbildungsrabatt',
  family: 'Familienrabatt',
  hardship: 'Härtefall',
  support: 'Skiff für Leistungssport',
  custom: 'Rabatt',
};

/**
 * The usage of the position a rebate reduces. A `support` rebate waives the skiff rental (the
 * private skiff is lent to the Leistungssport team); every other reason reduces the membership fee.
 */
const REBATE_REDUCES: Record<string, string> = { support: 'boatPlaceRental' };

/**
 * The per-member rebate as a fee position, or `undefined` when there is none. This is NOT a
 * schedule rule and therefore deliberately not part of `buildPositions`: `rebate`/`rebateReason`
 * are a manual override a treasurer sets on ONE membership, while `buildPositions` is pure over
 * (membership, schedule, ctx) and must stay reproducible from the year's price list alone.
 *
 * The rebate is booked as a revenue reduction on the account of the position it reduces (see
 * `REBATE_REDUCES`), falling back to the first position that has an account. Without an account
 * `postMemberFees` skips the whole member (`unbookablePositions`). Kept when the amount is zero
 * but a reason is set — the reason is information the treasurer entered.
 */
export function rebatePosition(rebate: number, rebateReason: string, positions: MemberFeePosition[] = []): MemberFeePosition | undefined {
  const amount = Number(rebate) || 0;
  const reason = rebateReason === 'none' ? '' : (rebateReason ?? '');
  if (amount === 0 && reason.length === 0) return undefined;
  const usage = REBATE_REDUCES[reason] ?? 'membershipFee';
  const withAccount = positions.filter(p => p.type !== 'rebate' && (p.accountKey ?? '').length > 0);
  const target = withAccount.find(p => p.usage === usage) ?? withAccount[0];
  return { key: 'rebate', usage: 'other', type: 'rebate', label: REBATE_REASON_LABELS[reason] ?? 'Rabatt',
    amount, accountKey: target?.accountKey ?? '', vatCodeKey: '' };
}

/** Σ of every non-rebate position minus Σ of every rebate position. */
export function getFeeTotal(positions: MemberFeePosition[]): number {
  return positions.reduce((sum, p) => p.type === 'rebate' ? sum - p.amount : sum + p.amount, 0);
}
