import { CategoryItemModel, CategoryListModel } from '@okr/shared-models';

/**
 * The selectable values of a `FeePositionRule`, as `CategoryListModel`s for `okr-cat-select`.
 *
 * These are **closed registries in code**, not Firestore category documents: `FeeSource`,
 * `FeeFlag` and `FeeRule` are union types whose members are predicates implemented and tested in
 * `buildPositions`, and `usage`/`type` are the invoice-position vocabularies the invoice domain
 * already ships labels for. Building the lists here keeps the select in step with the type — a
 * value the engine cannot evaluate can never be picked.
 *
 * Labels:
 * - `usage`/`type` resolve to the invoice bundle's existing
 *   `@finance/invoice/feature.invoice_position_usage|invoice_position_type.<item>.label`.
 * - `source`/`flag`/`rule` resolve to `@finance/accounting/feature.feeSchedule.<name>.<item>.label`.
 */

const INVOICE_I18N = '@finance/invoice/feature';
const FEE_SCHEDULE_I18N = '@finance/accounting/feature.feeSchedule';

/** every `FeeSource` member of the model's union, in the order a treasurer meets them */
export const FEE_SOURCES = ['category', 'flag', 'rule', 'manual'] as const;
/** every `FeeFlag` member — one predicate per entry in `buildPositions`' FLAGS registry */
export const FEE_FLAGS = ['hasLocker'] as const;
/** every `FeeRule` member — one predicate per entry in `buildPositions`' RULES registry */
export const FEE_RULES = ['newMemberOver25'] as const;
/** the invoice-position usages a fee position may carry (`MemberFeePosition.usage`) */
export const FEE_POSITION_USAGES = [
  'membershipFee', 'srvFee', 'lockerRental', 'boatPlaceRental',
  'insurance', 'license', 'beverages', 'other',
] as const;
/** the invoice-position types a fee position may carry (`MemberFeePosition.type`) */
export const FEE_POSITION_TYPES = ['fix', 'unit', 'hours', 'days', 'deduction', 'rebate'] as const;

function buildCategory(
  tenantId: string, name: string, items: readonly string[], i18n: string, translateItems: boolean
): CategoryListModel {
  const category = new CategoryListModel(tenantId);
  category.okey = name;
  category.name = name;
  category.i18n = i18n;
  category.translateItems = translateItems;
  category.items = items.map(item => new CategoryItemModel(item, ''));
  return category;
}

export function getFeeSourceCategory(tenantId: string): CategoryListModel {
  return buildCategory(tenantId, 'source', FEE_SOURCES, FEE_SCHEDULE_I18N, true);
}

export function getFeeFlagCategory(tenantId: string): CategoryListModel {
  return buildCategory(tenantId, 'flag', FEE_FLAGS, FEE_SCHEDULE_I18N, true);
}

export function getFeeRuleCategory(tenantId: string): CategoryListModel {
  return buildCategory(tenantId, 'rule', FEE_RULES, FEE_SCHEDULE_I18N, true);
}

export function getFeePositionUsageCategory(tenantId: string): CategoryListModel {
  return buildCategory(tenantId, 'invoice_position_usage', FEE_POSITION_USAGES, INVOICE_I18N, true);
}

export function getFeePositionTypeCategory(tenantId: string): CategoryListModel {
  return buildCategory(tenantId, 'invoice_position_type', FEE_POSITION_TYPES, INVOICE_I18N, true);
}

/**
 * The years a `feeSchedule` holds, newest first. Years are data, not a vocabulary, so the items
 * carry no i18n — the label IS the year.
 */
export function getFeeScheduleYearCategory(tenantId: string, years: readonly number[]): CategoryListModel {
  const sorted = [...new Set(years)].sort((a, b) => b - a).map(year => `${year}`);
  return buildCategory(tenantId, 'year', sorted, '', false);
}

/**
 * The tenant's VAT codes as a category. `vatCodeKey` stores a code's `okey`, and the okey is
 * `<accountingTenantId>-<code>` (see `VatCodeService.seedStandardCodes`), so it reads as a label
 * on its own — no translation, and no label/value mismatch to keep in sync.
 */
export function getVatCodeCategory(
  tenantId: string, vatCodes: readonly { okey: string; code: string }[]
): CategoryListModel {
  const category = buildCategory(tenantId, 'vatCode', vatCodes.map(vatCode => vatCode.okey), '', false);
  category.items = category.items.map(
    (item, index) => new CategoryItemModel(item.name, '', vatCodes[index].code));
  return category;
}
