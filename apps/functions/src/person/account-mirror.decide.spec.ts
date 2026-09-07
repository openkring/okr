import { describe, expect, it } from 'vitest';

import { accountTenantsOf, affectedPersonKeys, sameTenants } from './account-mirror.decide';

describe('affectedPersonKeys', () => {
  it('names the person when a user document is created', () => {
    expect(affectedPersonKeys(undefined, { personKey: 'p1', tenants: ['scs'] })).toEqual(['p1']);
  });

  it('names the person when the user document is deleted', () => {
    expect(affectedPersonKeys({ personKey: 'p1', tenants: ['scs'] }, undefined)).toEqual(['p1']);
  });

  it('names both when the account is re-linked to another person', () => {
    expect(affectedPersonKeys({ personKey: 'p1', tenants: ['scs'] }, { personKey: 'p2', tenants: ['scs'] }))
      .toEqual(['p1', 'p2']);
  });

  it('recomputes when the account moves to another tenant', () => {
    expect(affectedPersonKeys({ personKey: 'p1', tenants: ['scs'] }, { personKey: 'p1', tenants: ['elab'] }))
      .toEqual(['p1']);
  });

  it('does nothing for an edit that touches neither person nor tenant', () => {
    const doc = { personKey: 'p1', tenants: ['scs'] };
    expect(affectedPersonKeys(doc, { ...doc })).toEqual([]);
  });

  it('ignores an empty personKey on either side', () => {
    expect(affectedPersonKeys(undefined, { personKey: '', tenants: ['scs'] })).toEqual([]);
    expect(affectedPersonKeys({ personKey: '' }, undefined)).toEqual([]);
  });
});

describe('accountTenantsOf', () => {
  it('is empty when the person holds no account', () => {
    expect(accountTenantsOf([])).toEqual([]);
  });

  it('unions the tenants of every account the person holds', () => {
    // persons/kaiser really does hold seven accounts, one per tenant, each with its own login
    const users = [{ tenants: ['scs'] }, { tenants: ['elab'] }, { tenants: ['bka'] }];
    expect(accountTenantsOf(users)).toEqual(['bka', 'elab', 'scs']);
  });

  it('de-duplicates and sorts so an unchanged set compares equal', () => {
    expect(accountTenantsOf([{ tenants: ['scs'] }, { tenants: ['scs'] }])).toEqual(['scs']);
  });

  it('skips a user document without tenants', () => {
    expect(accountTenantsOf([{ tenants: undefined }, { tenants: ['scs'] }])).toEqual(['scs']);
  });
});

describe('sameTenants', () => {
  it('ignores order and duplicates', () => {
    expect(sameTenants(['scs', 'elab'], ['elab', 'scs'])).toBe(true);
    expect(sameTenants(['scs', 'scs'], ['scs'])).toBe(true);
  });

  it('treats undefined as the empty set', () => {
    expect(sameTenants(undefined, [])).toBe(true);
    expect(sameTenants(undefined, ['scs'])).toBe(false);
  });

  it('sees a real difference', () => {
    expect(sameTenants(['scs'], ['elab'])).toBe(false);
    expect(sameTenants(['scs'], ['scs', 'elab'])).toBe(false);
  });
});
