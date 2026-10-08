import { describe, expect, it } from 'vitest';
import { isAssignableProject, projectKeyForLine } from './project-check.util';

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
