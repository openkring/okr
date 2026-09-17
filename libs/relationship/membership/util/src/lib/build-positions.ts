import type {
  FeePositionRule, FeeScheduleEntry, MemberFeePosition, MembershipModel,
} from '@okr/shared-models';

/** Everything the derivation needs that is not on the membership itself. */
export interface FeeContext {
  hasLocker: boolean;
  currentYear: number;
  /** category-list name -> category -> price, flattened by the caller from the category lists. */
  categoryLists: Record<string, Record<string, number>>;
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
      return ctx.categoryLists[rule.categoryList ?? '']?.[membership.category] ?? 0;
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
 * The per-member rebate as a fee position, or `undefined` when there is none. This is NOT a
 * schedule rule and therefore deliberately not part of `buildPositions`: `rebate`/`rebateReason`
 * are a manual override a treasurer sets on ONE membership, while `buildPositions` is pure over
 * (membership, schedule, ctx) and must stay reproducible from the year's price list alone.
 *
 * The shape mirrors what the migration writes for a legacy rebate column (key 'rebate',
 * usage 'other', label = the reason, falling back to 'Rabatt'), so a migrated row and a freshly
 * derived row are indistinguishable. Kept when the amount is zero but a reason is set — the
 * reason is information the treasurer entered.
 */
export function rebatePosition(rebate: number, rebateReason: string): MemberFeePosition | undefined {
  const amount = Number(rebate) || 0;
  const reason = rebateReason === 'none' ? '' : (rebateReason ?? '');
  if (amount === 0 && reason.length === 0) return undefined;
  return { key: 'rebate', usage: 'other', type: 'rebate', label: reason || 'Rabatt',
    amount, accountKey: '', vatCodeKey: '' };
}

/** Σ of every non-rebate position minus Σ of every rebate position. */
export function getFeeTotal(positions: MemberFeePosition[]): number {
  return positions.reduce((sum, p) => p.type === 'rebate' ? sum - p.amount : sum + p.amount, 0);
}
