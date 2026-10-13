import { describe, expect, it } from 'vitest';
import { chunk, isOperatorUserData, mayDeleteAuthUser, OPERATOR_TENANT_ID, tenantIdOfUserData, type CallerContext } from './general.util';

describe('tenantIdOfUserData', () => {
  it('returns the single tenant a user belongs to', () => {
    expect(tenantIdOfUserData({ tenants: ['scs'] })).toBe('scs');
  });

  it('returns the first tenant when a legacy doc carries several', () => {
    expect(tenantIdOfUserData({ tenants: ['p13', 'scs'] })).toBe('p13');
  });

  it('returns empty for a missing user document', () => {
    expect(tenantIdOfUserData(undefined)).toBe('');
  });

  it('returns empty when the user has no tenants field', () => {
    expect(tenantIdOfUserData({ loginEmail: 'a@b.ch' })).toBe('');
  });

  it('returns empty for an empty tenants array', () => {
    expect(tenantIdOfUserData({ tenants: [] })).toBe('');
  });

  it('returns empty when tenants is not an array (never trust a stored shape)', () => {
    expect(tenantIdOfUserData({ tenants: 'scs' })).toBe('');
  });

  it('returns empty when the first entry is not a string', () => {
    expect(tenantIdOfUserData({ tenants: [42] })).toBe('');
  });
});

describe('isOperatorUserData', () => {
  const adminRoles = { admin: true };

  it('accepts a users doc whose tenants is exactly the operator tenant and that carries roles.admin', () => {
    expect(OPERATOR_TENANT_ID).toBe('bka');
    expect(isOperatorUserData({ tenants: ['bka'], roles: adminRoles })).toBe(true);
  });

  it('rejects a bka doc without roles (a self-created doc can never carry roles.admin)', () => {
    expect(isOperatorUserData({ tenants: ['bka'] })).toBe(false);
  });

  it('rejects roles.admin that is not exactly true', () => {
    expect(isOperatorUserData({ tenants: ['bka'], roles: { admin: false } })).toBe(false);
    expect(isOperatorUserData({ tenants: ['bka'], roles: { admin: 'true' } })).toBe(false);
  });

  it('rejects roles that is not an object', () => {
    expect(isOperatorUserData({ tenants: ['bka'], roles: 'admin' })).toBe(false);
  });

  it('rejects ["bka", <own tenant>] (the rules let an admin write it, tenants[0] would be wrong)', () => {
    expect(isOperatorUserData({ tenants: ['bka', 'scs'], roles: adminRoles })).toBe(false);
  });

  it('rejects bka when it is not the only entry', () => {
    expect(isOperatorUserData({ tenants: ['scs', 'bka'], roles: adminRoles })).toBe(false);
  });

  it('rejects other tenants, an empty array, a missing doc and a non-array tenants', () => {
    expect(isOperatorUserData({ tenants: ['scs'], roles: adminRoles })).toBe(false);
    expect(isOperatorUserData({ tenants: [], roles: adminRoles })).toBe(false);
    expect(isOperatorUserData(undefined)).toBe(false);
    expect(isOperatorUserData({ tenants: 'bka', roles: adminRoles })).toBe(false);
  });
});

describe('mayDeleteAuthUser', () => {
  const operator: CallerContext = { tenantId: 'bka', isOperator: true };
  const scs: CallerContext = { tenantId: 'scs', isOperator: false };

  it('the operator may delete any login, even one without a users doc', () => {
    expect(mayDeleteAuthUser(operator, undefined)).toBe(true);
    expect(mayDeleteAuthUser(operator, { tenants: ['scs'] })).toBe(true);
  });

  it('a bka-first multi-tenant admin is not the operator and may not delete another tenant\'s login', () => {
    const adminWithBkaFirst: CallerContext = { tenantId: 'bka', isOperator: false };
    expect(mayDeleteAuthUser(adminWithBkaFirst, { tenants: ['scs'] })).toBe(false);
  });

  it('a tenant may delete the login of its own single-tenant user', () => {
    expect(mayDeleteAuthUser(scs, { tenants: ['scs'] })).toBe(true);
  });

  it('a tenant may not delete a login whose users doc is missing', () => {
    expect(mayDeleteAuthUser(scs, undefined)).toBe(false);
  });

  it('a tenant may not delete another tenant\'s login', () => {
    expect(mayDeleteAuthUser(scs, { tenants: ['p13'] })).toBe(false);
  });

  it('a tenant may not delete a login shared with another tenant', () => {
    expect(mayDeleteAuthUser(scs, { tenants: ['scs', 'p13'] })).toBe(false);
  });

  it('never trusts a malformed tenants field', () => {
    expect(mayDeleteAuthUser(scs, { tenants: 'scs' })).toBe(false);
    expect(mayDeleteAuthUser({ tenantId: '', isOperator: false }, { tenants: [''] })).toBe(false);
  });
});

describe('chunk', () => {
  it('splits into slices of at most size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns no slices for an empty list', () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it('keeps 250 uids in three getUsers-sized batches', () => {
    const uids = Array.from({ length: 250 }, (_, i) => `u${i}`);
    const slices = chunk(uids, 100);
    expect(slices.map(s => s.length)).toEqual([100, 100, 50]);
    expect(slices.flat()).toEqual(uids);
  });

  it('rejects a non-positive size instead of looping forever', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});
