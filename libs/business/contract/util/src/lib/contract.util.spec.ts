import { describe, expect, it } from 'vitest';
import { AVATAR_INFO_SHAPE, ContractModel } from '@okr/shared-models';
import {
  applyDerivedFields, clearedContractFields, derivePartyPersonKeys, formatLeadDays, getContractIndex, isLoanType, newContractModel, newLoanTerms,
  parseLeadDays, sumLoans, toContractCreatePayload, toContractUpdatePayload,
} from './contract.util';

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

describe('loan helpers', () => {
  it('isLoanType only for loan and mortgage', () => {
    expect(isLoanType('loan')).toBe(true);
    expect(isLoanType('mortgage')).toBe(true);
    expect(isLoanType('lease')).toBe(false);
    expect(isLoanType(undefined)).toBe(false);
  });
  it('newLoanTerms has a plain zero CHF principal', () => {
    const l = newLoanTerms();
    expect(l.principal).toEqual({ amount: 0, currency: 'CHF', periodicity: 'once' });
    expect(Object.getPrototypeOf(l.principal)).toBe(Object.prototype);
    expect(l.repayment).toBe('bullet');
  });
});

describe('lead days', () => {
  it('parses, dedupes and sorts descending', () => {
    expect(parseLeadDays('7, 90;30 30 x -1 0 2.5')).toEqual([90, 30, 7]);
    expect(parseLeadDays('')).toEqual([]);
  });
  it('parses partial input in any order without needing the formatted text', () => {
    expect(parseLeadDays('7, 90')).toEqual([90, 7]);
    expect(parseLeadDays('7, 9')).toEqual([9, 7]);
    expect(parseLeadDays('3, 30')).toEqual([30, 3]);
    expect(parseLeadDays('3, ')).toEqual([3]);
  });
  it('formats', () => {
    expect(formatLeadDays([90, 30])).toBe('90, 30');
    expect(formatLeadDays(undefined)).toBe('');
  });
});

describe('sumLoans', () => {
  const loan = (principal: number, outstanding: number, currency: 'CHF' | 'EUR' = 'CHF') => Object.assign(new ContractModel('t1'), {
    contractType: 'loan',
    loan: { ...newLoanTerms(), principal: { amount: principal, currency, periodicity: 'once' }, outstanding: { amount: outstanding, currency, periodicity: 'once' } },
  }) as ContractModel;

  it('sums CHF loans only and ignores contracts without loan terms', () => {
    expect(sumLoans([loan(100000, 80000), loan(50000, 0), loan(70000, 70000, 'EUR'), new ContractModel('t1')]))
      .toEqual({ principal: 150000, outstanding: 80000 });
  });

  it('is zero for an empty list', () => {
    expect(sumLoans([])).toEqual({ principal: 0, outstanding: 0 });
  });
});

describe('client write payloads', () => {
  const ref = { docKey: 'd1', role: 'contract' as const, title: 'V', docState: 'signed' as const };
  it('update never carries the server-owned documents / remindersSent', () => {
    const c = Object.assign(new ContractModel('t1'), { okey: 'c1', name: 'N', documents: [ref], remindersSent: ['end:20300101:30'] });
    const p = toContractUpdatePayload(c) as Record<string, unknown>;
    expect('documents' in p).toBe(false);
    expect('remindersSent' in p).toBe(false);
    expect(p['name']).toBe('N');
    expect(c.documents).toEqual([ref]);
  });
  it('create starts with no files and no reminders, whatever the modal held', () => {
    const c = Object.assign(new ContractModel('t1'), { documents: [ref], remindersSent: ['x'] });
    const p = toContractCreatePayload(c);
    expect(p.documents).toEqual([]);
    expect(p.remindersSent).toEqual([]);
  });
  it('lists the unset clearable fields for deletion', () => {
    const c = new ContractModel('t1');
    expect(clearedContractFields(c)).toEqual(['responsible', 'notice', 'value', 'loan']);
    c.responsible = { ...AVATAR_INFO_SHAPE, key: 'p1', modelType: 'person' };
    c.loan = newLoanTerms();
    expect(clearedContractFields(c)).toEqual(['notice', 'value']);
  });
});

describe('getContractIndex', () => {
  it('tolerates a null party or one without an avatar (legacy / anonymized docs)', () => {
    const c = Object.assign(new ContractModel('t1'), {
      name: 'N', contractType: 'loan', contractNumber: '1',
      parties: [null, { role: 'guarantor' }, { role: 'counterparty', avatar: av('p1', 'person', 'Muster') }],
    }) as unknown as ContractModel;
    expect(getContractIndex(c)).toBe('n:N t:loan nr:1 p:A Muster');
  });
});
