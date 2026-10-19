import { describe, expect, it } from 'vitest';

import { OrgModel, PersonModel } from '@okr/shared-models';

import { booksOfOrg, orgOwnerKey, ownerDisplayName, ownerOrgOfBooks, parseOwnerKey, personOwnerKey, resolveOwnerKey } from './accounting-owner.util';

describe('parseOwnerKey', () => {
  it('splits an org owner', () => {
    expect(parseOwnerKey('org.scs')).toEqual({ modelType: 'org', key: 'scs' });
  });

  it('splits a person owner', () => {
    expect(parseOwnerKey('person.kaiser')).toEqual({ modelType: 'person', key: 'kaiser' });
  });

  it('keeps dots inside the key', () => {
    expect(parseOwnerKey('org.a.b')).toEqual({ modelType: 'org', key: 'a.b' });
  });

  it('is undefined for an empty or missing value', () => {
    expect(parseOwnerKey('')).toBeUndefined();
    expect(parseOwnerKey(undefined)).toBeUndefined();
  });

  it('is undefined for an unknown prefix, a bare okey or an empty key', () => {
    expect(parseOwnerKey('group.board')).toBeUndefined();
    expect(parseOwnerKey('scs')).toBeUndefined();
    expect(parseOwnerKey('org.')).toBeUndefined();
    expect(parseOwnerKey('person.')).toBeUndefined();
  });
});

describe('orgOwnerKey / personOwnerKey', () => {
  it('prefix the okey', () => {
    expect(orgOwnerKey('mkdf7xin64es5q4rmhdj')).toBe('org.mkdf7xin64es5q4rmhdj');
    expect(personOwnerKey('kaiser')).toBe('person.kaiser');
  });

  it('round-trip through parseOwnerKey', () => {
    expect(parseOwnerKey(orgOwnerKey('scs'))).toEqual({ modelType: 'org', key: 'scs' });
    expect(parseOwnerKey(personOwnerKey('kaiser'))).toEqual({ modelType: 'person', key: 'kaiser' });
  });
});

describe('resolveOwnerKey', () => {
  it('reads ownerKey when set', () => {
    expect(resolveOwnerKey({ ownerKey: 'person.kaiser' })).toBe('person.kaiser');
    expect(resolveOwnerKey({ ownerKey: 'org.mkdf7xin64es5q4rmhdj' })).toBe('org.mkdf7xin64es5q4rmhdj');
  });

  it('is empty when not set, never the tenant or the app-config owner', () => {
    expect(resolveOwnerKey({})).toBe('');
    expect(resolveOwnerKey({ ownerKey: '' })).toBe('');
    expect(resolveOwnerKey(undefined)).toBe('');
  });
});

describe('ownerDisplayName', () => {
  const orgs: Record<string, OrgModel> = { scs: { okey: 'scs', name: 'Seeclub Stäfa' } as OrgModel };
  const persons: Record<string, PersonModel> = { kaiser: { okey: 'kaiser', firstName: 'Bruno', lastName: 'Kaiser' } as PersonModel };
  const getOrg = (key: string) => orgs[key];
  const getPerson = (key: string) => persons[key];

  it('prints the org name or the person full name', () => {
    expect(ownerDisplayName('org.scs', getOrg, getPerson)).toBe('Seeclub Stäfa');
    expect(ownerDisplayName('person.kaiser', getOrg, getPerson)).toBe('Bruno Kaiser');
  });

  it('is empty for no owner, an invalid key or an owner whose doc is not loaded (never the raw okey)', () => {
    expect(ownerDisplayName('', getOrg, getPerson)).toBe('');
    expect(ownerDisplayName('scs', getOrg, getPerson)).toBe('');
    expect(ownerDisplayName('org.unknown', getOrg, getPerson)).toBe('');
    expect(ownerDisplayName('person.unknown', getOrg, getPerson)).toBe('');
  });
});

describe('booksOfOrg', () => {
  const cfg = (okey: string, rest: Record<string, unknown>) => ({ okey, ...rest });

  it('takes the one books config of the tenant owned by the org (ownerKey)', () => {
    expect(booksOfOrg([cfg('scs', { tenants: ['scs'], ownerKey: 'org.scs' })], 'scs', 'scs')).toBe('scs');
  });

  it('finds books whose id differs from the org okey (gss owned by an org)', () => {
    const configs = [cfg('scs', { tenants: ['scs'], ownerKey: 'org.scs' }), cfg('gss', { tenants: ['scs'], ownerKey: 'org.mkdf7xin64es5q4rmhdj' })];
    expect(booksOfOrg(configs, 'scs', 'mkdf7xin64es5q4rmhdj')).toBe('gss');
    expect(booksOfOrg(configs, 'scs', 'scs')).toBe('scs');
  });

  it('never takes the books from the org okey or the tenant alone', () => {
    expect(booksOfOrg([cfg('scs', { tenants: ['scs'] })], 'scs', 'scs')).toBeUndefined();
    expect(booksOfOrg([cfg('scs', { tenants: ['scs'], ownerKey: '' })], 'scs', 'scs')).toBeUndefined();
  });

  it('ignores personal books, other tenants and archived configs', () => {
    expect(booksOfOrg([cfg('bka', { tenants: ['scs'], ownerKey: 'person.kaiser' })], 'scs', 'kaiser')).toBeUndefined();
    expect(booksOfOrg([cfg('scs', { tenants: ['evil'], ownerKey: 'org.scs' })], 'scs', 'scs')).toBeUndefined();
    expect(booksOfOrg([cfg('scs', { tenants: ['scs'], ownerKey: 'org.scs', isArchived: true })], 'scs', 'scs')).toBeUndefined();
  });

  it('is undefined when several books match', () => {
    const configs = [cfg('a', { tenants: ['scs'], ownerKey: 'org.scs' }), cfg('b', { tenants: ['scs'], ownerKey: 'org.scs' })];
    expect(booksOfOrg(configs, 'scs', 'scs')).toBeUndefined();
  });

  it('is undefined without an org or tenant', () => {
    expect(booksOfOrg([cfg('scs', { tenants: ['scs'], ownerKey: 'org.' })], 'scs', '')).toBeUndefined();
    expect(booksOfOrg([cfg('scs', { tenants: ['scs'], ownerKey: 'org.scs' })], '', 'scs')).toBeUndefined();
  });
});

describe('ownerOrgOfBooks', () => {
  it('returns the org okey of org-owned books', () => {
    expect(ownerOrgOfBooks({ ownerKey: 'org.scs' })).toBe('scs');
  });

  it('is undefined for person-owned, empty or missing owners', () => {
    expect(ownerOrgOfBooks({ ownerKey: 'person.kaiser' })).toBeUndefined();
    expect(ownerOrgOfBooks({ ownerKey: '' })).toBeUndefined();
    expect(ownerOrgOfBooks(undefined)).toBeUndefined();
  });
});
