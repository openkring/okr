import { ContractModel, ContractParty } from '@okr/shared-models';
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
