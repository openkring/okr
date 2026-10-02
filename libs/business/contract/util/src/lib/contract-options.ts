import {
  CategoryItemModel, CategoryListModel, Confidentiality, CONTRACT_STATES, CONTRACT_TYPES, ContractParty, LoanTerms, NoticeAnchor, NoticePeriod,
} from '@okr/shared-models';

/** Option catalogues for the contract form's selects (the ids are stored, the labels are i18n). */
export const CONFIDENTIALITY_LEVELS: Confidentiality[] = ['internal', 'confidential', 'strictlyConfidential'];
export const PARTY_ROLES: ContractParty['role'][] = ['internal', 'counterparty', 'guarantor'];
export const NOTICE_UNITS: NoticePeriod['unit'][] = ['days', 'weeks', 'months'];
export const NOTICE_ANCHORS: NoticeAnchor[] = ['anytime', 'monthEnd', 'quarterEnd', 'yearEnd', 'contractEnd'];
export const LOAN_DIRECTIONS: LoanTerms['direction'][] = ['borrowed', 'lent'];
export const REPAYMENT_KINDS: LoanTerms['repayment'][] = ['bullet', 'linear', 'annuity', 'onDemand'];

/** i18n scope of the code-built filter categories below (labels at `<scope>.<name>.<item>.label`). */
const CONTRACT_FILTER_SCOPE = '@business/contract/util';

/**
 * The list's type and state filters, built in code rather than read from `categories` (like the
 * ticket pickers): item `name` is the stored id the store filters on, never a translated label.
 */
export function contractTypeFilterCategory(tenantId: string): CategoryListModel {
  return filterCategory(tenantId, 'filterType', CONTRACT_TYPES);
}

export function contractStateFilterCategory(tenantId: string): CategoryListModel {
  return filterCategory(tenantId, 'filterState', CONTRACT_STATES);
}

function filterCategory(tenantId: string, name: string, ids: readonly string[]): CategoryListModel {
  const category = new CategoryListModel(tenantId);
  category.name = name;
  category.i18n = CONTRACT_FILTER_SCOPE;
  category.translateItems = true;
  category.items = ids.map((id) => new CategoryItemModel(id, ''));
  return category;
}
