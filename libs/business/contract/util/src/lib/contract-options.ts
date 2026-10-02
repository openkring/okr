import { Confidentiality, ContractParty, LoanTerms, NoticeAnchor, NoticePeriod } from '@okr/shared-models';

/** Option catalogues for the contract form's selects (the ids are stored, the labels are i18n). */
export const CONFIDENTIALITY_LEVELS: Confidentiality[] = ['internal', 'confidential', 'strictlyConfidential'];
export const PARTY_ROLES: ContractParty['role'][] = ['internal', 'counterparty', 'guarantor'];
export const NOTICE_UNITS: NoticePeriod['unit'][] = ['days', 'weeks', 'months'];
export const NOTICE_ANCHORS: NoticeAnchor[] = ['anytime', 'monthEnd', 'quarterEnd', 'yearEnd', 'contractEnd'];
export const LOAN_DIRECTIONS: LoanTerms['direction'][] = ['borrowed', 'lent'];
export const REPAYMENT_KINDS: LoanTerms['repayment'][] = ['bullet', 'linear', 'annuity', 'onDemand'];
