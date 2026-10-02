import { describe, expect, it } from 'vitest';
import { AVATAR_INFO_SHAPE, ContractModel } from '@okr/shared-models';
import { applyDerivedFields, derivePartyPersonKeys, newContractModel } from './contract.util';

const av = (key: string, modelType: 'person' | 'org', name2 = 'X') => ({ ...AVATAR_INFO_SHAPE, key, modelType, name1: 'A', name2 });

describe('derivePartyPersonKeys', () => {
  it('persons only, unique, no empty keys', () => {
    expect(derivePartyPersonKeys([
      { role: 'counterparty', avatar: av('p1', 'person') },
      { role: 'guarantor', avatar: av('p1', 'person') },
      { role: 'internal', avatar: av('o1', 'org') },
      { role: 'counterparty', avatar: av('', 'person') },
    ])).toEqual(['p1']);
  });
});

describe('applyDerivedFields', () => {
  it('sets keys, strict flag, next deadline and index without mutating', () => {
    const c = Object.assign(new ContractModel('t1'), {
      name: 'Darlehen Muster', contractType: 'loan', state: 'active', endDate: '20301231',
      confidentiality: 'strictlyConfidential', parties: [{ role: 'counterparty', avatar: av('p9', 'person', 'Muster') }],
    }) as ContractModel;
    const d = applyDerivedFields(c, '20270101');
    expect(d.partyPersonKeys).toEqual(['p9']);
    expect(d.isStrictlyConfidential).toBe(true);
    expect(d.nextDeadline).toBe('20301231');
    expect(d.nextDeadlineKind).toBe('end');
    expect(d.index).toContain('Darlehen Muster');
    expect(c.partyPersonKeys).toEqual([]);
  });
});

describe('newContractModel', () => {
  it('loan-ready defaults', () => {
    const c = newContractModel('scs');
    expect(c.tenants).toEqual(['scs']);
    expect(c.state).toBe('draft');
    expect(c.confidentiality).toBe('internal');
  });
});
