/**
 * ONE-OFF MIGRATION DECISION — the finance split (owner decision 2026-11-10, plan 2 Task 7b). Pure; the
 * Firestore I/O lives in `scripts/migrate-finance-split.mjs`.
 *
 * Before the split, the `finance` block carried Kostenrechnung, Spesen/OCR and Anlagen. Owner ruling: keep
 * everything — a tenant that had `finance` in `enabledFeatures` keeps those screens, so it gets the three new
 * blocks added. A tenant billed by Stripe also gets the three matching paid options added to
 * `subscriptions/{tenantId}.options` (billed from the next run), so the paid-option fence and
 * `setSubscriptionOptions` agree with what is switched on.
 *
 * A tenant WITHOUT `enabledFeatures` (legacy «all non-internal blocks», D-BB-10) is untouched: the new
 * blocks are `ga`, so the legacy path already includes them.
 *
 * Idempotent: only missing ids are added, existing order is kept, a second run plans nothing.
 */

/** The blocks carved out of `finance`. */
export const FINANCE_SPLIT_BLOCKS: readonly string[] = ['cost-accounting', 'expense', 'asset'];

/** The paid options of those blocks (`ADD_ON_BLOCKS` in `@okr/business-metering-util`). */
export const FINANCE_SPLIT_OPTIONS: readonly string[] = ['kostenrechnung', 'spesen-ocr', 'anlagen'];

export interface FinanceSplitInput {
  /** `app-config/{tenantId}.enabledFeatures`; undefined = legacy «all blocks». */
  enabledFeatures?: unknown;
  /** `subscriptions/{tenantId}.billing`, e.g. 'stripe'. */
  billing?: unknown;
  /** `subscriptions/{tenantId}.options`. */
  options?: unknown;
}

export interface FinanceSplitPlan {
  /** Block ids to add to `enabledFeatures` (empty = nothing to write there). */
  addBlocks: string[];
  /** The full new `enabledFeatures`, set only when `addBlocks` is not empty. */
  enabledFeatures?: string[];
  /** Option ids to add to `subscriptions/{tenantId}.options` (empty = nothing to write there). */
  addOptions: string[];
  /** The full new `options`, set only when `addOptions` is not empty. */
  options?: string[];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** What the finance split changes for one tenant. */
export function planFinanceSplit(input: FinanceSplitInput): FinanceSplitPlan {
  if (!Array.isArray(input.enabledFeatures)) return { addBlocks: [], addOptions: [] };
  const enabled = strings(input.enabledFeatures);
  if (!enabled.includes('finance')) return { addBlocks: [], addOptions: [] };

  const addBlocks = FINANCE_SPLIT_BLOCKS.filter(b => !enabled.includes(b));
  const plan: FinanceSplitPlan = { addBlocks, addOptions: [] };
  if (addBlocks.length > 0) plan.enabledFeatures = [...enabled, ...addBlocks];

  if (input.billing === 'stripe') {
    const options = strings(input.options);
    plan.addOptions = FINANCE_SPLIT_OPTIONS.filter(o => !options.includes(o));
    if (plan.addOptions.length > 0) plan.options = [...options, ...plan.addOptions];
  }
  return plan;
}
