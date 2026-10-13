import { describe, expect, it } from 'vitest';
import { chunk, isOperatorTenant, mayDeleteAuthUser, OPERATOR_TENANT_ID, tenantIdOfUserData } from './general.util';

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

describe('isOperatorTenant', () => {
  it('accepts the operator tenant', () => {
    expect(OPERATOR_TENANT_ID).toBe('bka');
    expect(isOperatorTenant('bka')).toBe(true);
  });

  it('rejects every other tenant and the empty string', () => {
    expect(isOperatorTenant('scs')).toBe(false);
    expect(isOperatorTenant('')).toBe(false);
    expect(isOperatorTenant('BKA')).toBe(false);
  });

  it('a legacy multi-tenant user doc with bka not first is not the operator', () => {
    expect(isOperatorTenant(tenantIdOfUserData({ tenants: ['p13', 'bka'] }))).toBe(false);
  });
});

describe('mayDeleteAuthUser', () => {
  it('the operator may delete any login, even one without a users doc', () => {
    expect(mayDeleteAuthUser('bka', undefined)).toBe(true);
    expect(mayDeleteAuthUser('bka', { tenants: ['scs'] })).toBe(true);
  });

  it('a tenant may delete the login of its own single-tenant user', () => {
    expect(mayDeleteAuthUser('scs', { tenants: ['scs'] })).toBe(true);
  });

  it('a tenant may not delete a login whose users doc is missing', () => {
    expect(mayDeleteAuthUser('scs', undefined)).toBe(false);
  });

  it('a tenant may not delete another tenant\'s login', () => {
    expect(mayDeleteAuthUser('scs', { tenants: ['p13'] })).toBe(false);
  });

  it('a tenant may not delete a login shared with another tenant', () => {
    expect(mayDeleteAuthUser('scs', { tenants: ['scs', 'p13'] })).toBe(false);
  });

  it('never trusts a malformed tenants field', () => {
    expect(mayDeleteAuthUser('scs', { tenants: 'scs' })).toBe(false);
    expect(mayDeleteAuthUser('', { tenants: [''] })).toBe(false);
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
