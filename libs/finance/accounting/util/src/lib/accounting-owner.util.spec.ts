import { describe, expect, it } from 'vitest';

import { orgOwnerKey, parseOwnerKey, personOwnerKey, resolveOwnerKey } from './accounting-owner.util';

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
  });

  it('prefers ownerKey over a legacy orgId', () => {
    expect(resolveOwnerKey({ ownerKey: 'person.kaiser', orgId: 'scs' })).toBe('person.kaiser');
  });

  it('maps a legacy orgId to an org owner when ownerKey is missing or empty', () => {
    expect(resolveOwnerKey({ orgId: 'scs' })).toBe('org.scs');
    expect(resolveOwnerKey({ ownerKey: '', orgId: 'mkdf7xin64es5q4rmhdj' })).toBe('org.mkdf7xin64es5q4rmhdj');
  });

  it('is empty when neither is set, never the tenant or the app-config owner', () => {
    expect(resolveOwnerKey({})).toBe('');
    expect(resolveOwnerKey({ ownerKey: '', orgId: '' })).toBe('');
    expect(resolveOwnerKey(undefined)).toBe('');
  });
});
