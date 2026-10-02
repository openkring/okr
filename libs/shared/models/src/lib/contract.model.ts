import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { NamedModel, OkrModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';
import { MoneyModel } from './money.model';

/**
 * A contract = one dossier: parties, terms, deadlines and its files
 * (planning/specs/2026-06-17-spec-vertragsverwaltung.md §2–§3).
 * Annexes and amendments are FILES of the dossier (documents[]), not child contracts.
 */
export type ContractType =
  | 'loan' | 'mortgage' | 'partnerContract' | 'mandate' | 'workContract' | 'lease'
  | 'employment' | 'purchase' | 'nda' | 'license' | 'serviceAgreement' | 'other';
export const CONTRACT_TYPES: ContractType[] = [
  'loan', 'mortgage', 'partnerContract', 'mandate', 'workContract', 'lease',
  'employment', 'purchase', 'nda', 'license', 'serviceAgreement', 'other',
];

export type ContractState = 'draft' | 'negotiating' | 'active' | 'noticeGiven' | 'ended';
export const CONTRACT_STATES: ContractState[] = ['draft', 'negotiating', 'active', 'noticeGiven', 'ended'];

export type Confidentiality = 'internal' | 'confidential' | 'strictlyConfidential';
export type DeadlineKind = 'notice' | 'end' | 'rateFix';
export type NoticeAnchor = 'anytime' | 'monthEnd' | 'quarterEnd' | 'yearEnd' | 'contractEnd';

export interface ContractParty {
  role: 'internal' | 'counterparty' | 'guarantor';
  avatar: AvatarInfo;
}

export interface NoticePeriod {
  duration: number;
  unit: 'days' | 'weeks' | 'months';
}

export interface NoticeTerms {
  ours: NoticePeriod | undefined;   // drives the 'notice' reminder
  theirs: NoticePeriod | undefined; // display only
  to: NoticeAnchor;
}

export interface LoanTerms {
  direction: 'borrowed' | 'lent';
  principal: MoneyModel;
  interestRate: number;             // % p.a., 0 = zinslos
  rateFixedUntil: string;
  repayment: 'bullet' | 'linear' | 'annuity' | 'onDemand';
  repaymentAmount: MoneyModel | undefined;
  repaymentIntervalMonths: number;
  maturityDate: string;
  accountNo: string;
  collateral: string;
  outstanding: MoneyModel | undefined; // hand-maintained until 2.12
  outstandingAsOf: string;
}

export type ContractDocumentRole = 'contract' | 'annex' | 'amendment' | 'correspondence' | 'other';
export type ContractDocState = 'draft' | 'redline' | 'final' | 'signed';

export interface ContractDocumentRef {
  docKey: string;
  role: ContractDocumentRole;
  title: string;
  docState: ContractDocState;
}

export class ContractModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public name = DEFAULT_NAME;
  public notes = DEFAULT_NOTES;

  public contractType: ContractType = 'other';
  public contractNumber = '';
  public state: ContractState = 'draft';

  public parties: ContractParty[] = [];
  public partyPersonKeys: string[] = [];        // derived on save
  public responsible: AvatarInfo | undefined;

  public signingDate = '';
  public startDate = '';
  public endDate = '';                          // '' = open-ended
  public notice: NoticeTerms | undefined;
  public autoRenewMonths = 0;
  public noticeGivenDate = '';
  public noticeGivenBy: 'us' | 'them' | '' = '';
  public effectiveEndDate = '';

  public nextDeadline = '';                     // derived
  public nextDeadlineKind: DeadlineKind | '' = '';
  public reminderLeadDays: number[] = [];       // [] = default [90, 30, 7]
  public remindersSent: string[] = [];          // scanner only

  public value: MoneyModel | undefined;
  public billingCycle = '';

  public confidentiality: Confidentiality = 'internal';
  public isStrictlyConfidential = false;        // derived
  public documents: ContractDocumentRef[] = [];
  public abstract = '';
  public abstractSource: 'ai' | 'manual' | '' = '';

  public loan: LoanTerms | undefined;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ContractCollection = 'contracts';
export const ContractModelName = 'contract';
/** Dossier files — DocumentModel shape + contractKey/partyPersonKeys/confidentiality/isStrictlyConfidential; CF-write-only. */
export const ContractDocumentCollection = 'contract-documents';
