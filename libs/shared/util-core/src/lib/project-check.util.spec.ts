import { describe, expect, it } from 'vitest';
import { carryOverProjectKeys, isAssignableProject, isProjectKeyShapeValid, projectKeyForLine } from './project-check.util';

describe('isAssignableProject', () => {
  it('refuses an unknown project', () => expect(isAssignableProject(undefined, 'scs')).toBe(false));
  it('refuses an archived project', () => expect(isAssignableProject({ isArchived: true, tenants: ['scs'] }, 'scs')).toBe(false));
  it('refuses a project of another tenant', () => expect(isAssignableProject({ isArchived: false, tenants: ['kring'] }, 'scs')).toBe(false));
  it('refuses a project without tenants', () => expect(isAssignableProject({}, 'scs')).toBe(false));
  it('accepts an active project of the tenant', () => expect(isAssignableProject({ isArchived: false, tenants: ['kring', 'scs'] }, 'scs')).toBe(true));
  it('accepts a legacy project without isArchived', () => expect(isAssignableProject({ tenants: ['scs'] }, 'scs')).toBe(true));
});

describe('projectKeyForLine', () => {
  const accounts = new Map([['a6', { id: '6300' }], ['a1', { id: '1020' }]]);
  it('keeps the key on a P&L account', () => expect(projectKeyForLine(accounts, { accountKey: 'a6', projectKey: ' p1 ' })).toBe('p1'));
  it('gives empty on a balance-sheet account', () => expect(projectKeyForLine(accounts, { accountKey: 'a1', projectKey: 'p1' })).toBe(''));
  it('gives empty on an unknown account', () => expect(projectKeyForLine(accounts, { accountKey: 'zz', projectKey: 'p1' })).toBe(''));
  it('gives empty without a key', () => expect(projectKeyForLine(accounts, { accountKey: 'a6' })).toBe(''));
});

describe('isProjectKeyShapeValid', () => {
  it('accepts an absent key', () => expect(isProjectKeyShapeValid(undefined)).toBe(true));
  it('accepts an empty key', () => expect(isProjectKeyShapeValid('')).toBe(true));
  it('accepts a document id', () => expect(isProjectKeyShapeValid('p1')).toBe(true));
  it('refuses null', () => expect(isProjectKeyShapeValid(null)).toBe(false));
  it('refuses a number', () => expect(isProjectKeyShapeValid(42)).toBe(false));
  it('refuses an object', () => expect(isProjectKeyShapeValid({ okey: 'p1' })).toBe(false));
  it('refuses a path with a slash', () => expect(isProjectKeyShapeValid('projects/p1')).toBe(false));
});

describe('carryOverProjectKeys', () => {
  const debit = { amount: 100, currency: 'CHF' };
  const credit = { amount: 100, currency: 'CHF' };
  const stored = [
    { accountKey: 'a6', debitAmount: debit, projectKey: 'p1' },
    { accountKey: 'a1', creditAmount: credit, projectKey: '' },
  ];

  it('leaves the lines alone when a line carries the property (a current client)', () => {
    const lines = [{ accountKey: 'a6', debitAmount: debit, projectKey: '' }, { accountKey: 'a1', creditAmount: credit }];
    expect(carryOverProjectKeys(lines, stored)).toBe(lines);
  });

  it('keeps the stored key of the matching line for a pre-3.14 client', () => {
    const lines = [{ accountKey: 'a6', debitAmount: debit }, { accountKey: 'a1', creditAmount: credit }];
    expect(carryOverProjectKeys(lines, stored).map(l => l.projectKey)).toEqual(['p1', '']);
  });

  it('matches on the side, not only the account', () => {
    const lines = [{ accountKey: 'a6', creditAmount: credit }, { accountKey: 'a1', debitAmount: debit }];
    expect(carryOverProjectKeys(lines, stored).map(l => l.projectKey)).toEqual(['', '']);
  });

  it('uses every stored line once', () => {
    const lines = [{ accountKey: 'a6', debitAmount: debit }, { accountKey: 'a6', debitAmount: debit }];
    expect(carryOverProjectKeys(lines, stored).map(l => l.projectKey)).toEqual(['p1', '']);
  });

  it('gives empty keys for a new booking (no stored lines)', () => {
    const lines = [{ accountKey: 'a6', debitAmount: debit }];
    expect(carryOverProjectKeys(lines, []).map(l => l.projectKey)).toEqual(['']);
  });

  it('treats a legacy stored line without projectKey as empty', () => {
    const lines = [{ accountKey: 'a6', debitAmount: debit }];
    expect(carryOverProjectKeys(lines, [{ accountKey: 'a6', debitAmount: debit }]).map(l => l.projectKey)).toEqual(['']);
  });
});
