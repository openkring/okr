import { ContractModel, ContractParty, ContractType, LoanTerms, MoneyModel } from '@okr/shared-models';
import { computeNextDeadline } from './contract-deadline.util';

export function newContractModel(tenantId: string): ContractModel {
  return new ContractModel(tenantId);
}

export function derivePartyPersonKeys(parties: ContractParty[]): string[] {
  return [...new Set((parties ?? [])
    .filter((p) => p.avatar?.modelType === 'person' && !!p.avatar.key)
    .map((p) => p.avatar.key))];
}

export function getContractIndex(c: ContractModel): string {
  const parties = (c.parties ?? []).map((p) => `${p.avatar.name1} ${p.avatar.name2}`.trim()).join(' ');
  return `n:${c.name} t:${c.contractType} nr:${c.contractNumber} p:${parties}`;
}

/** Everything the client computes on save and the scanner recomputes (spec §6.1). */
export function applyDerivedFields(c: ContractModel, today: string): ContractModel {
  const next = computeNextDeadline(c, today);
  return {
    ...c,
    partyPersonKeys: derivePartyPersonKeys(c.parties),
    isStrictlyConfidential: c.confidentiality === 'strictlyConfidential',
    nextDeadline: next.date,
    nextDeadlineKind: next.kind,
    index: getContractIndex(c),
  };
}

/** Contract types that carry loan terms (the form's Darlehen section). */
export function isLoanType(type: ContractType | undefined): boolean {
  return type === 'loan' || type === 'mortgage';
}

/** A plain (prototype-free) MoneyModel in minor units, with the model's default currency/periodicity. */
export function newMoney(amount = 0): MoneyModel {
  return { ...new MoneyModel(amount) };
}

/** Empty loan terms, used when a contract is switched to loan/mortgage and has none yet. */
export function newLoanTerms(): LoanTerms {
  return {
    direction: 'borrowed', principal: newMoney(), interestRate: 0, rateFixedUntil: '',
    repayment: 'bullet', repaymentAmount: undefined, repaymentIntervalMonths: 0, maturityDate: '',
    accountNo: '', collateral: '', outstanding: undefined, outstandingAsOf: '',
  };
}

/** "90, 30, 7" → [90, 30, 7]: positive whole numbers only, unique, descending. */
export function parseLeadDays(text: string): number[] {
  const days = (text ?? '').split(/[,;\s]+/).map((t) => Number(t)).filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(days)].sort((a, b) => b - a);
}

export function formatLeadDays(days: number[] | undefined): string {
  return (days ?? []).join(', ');
}
