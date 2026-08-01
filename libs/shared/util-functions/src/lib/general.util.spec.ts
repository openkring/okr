import { describe, expect, it } from 'vitest';
import { tenantIdOfUserData } from './general.util';

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
