import { describe, expect, it } from 'vitest';

import { addressReleasePatch, avatarListHolds, isActiveMembership, isActiveSubscription, releaseAction } from './tenant-link.logic';

describe('releaseAction', () => {
  it('archives a person of this tenant only', () => {
    expect(releaseAction(['t1'], 't1', false)).toBe('archived');
  });

  it('detaches a person shared with another tenant', () => {
    expect(releaseAction(['t1', 't2'], 't1', false)).toBe('detached');
  });

  it('keeps a person with another link to the tenant', () => {
    expect(releaseAction(['t1'], 't1', true)).toBe('kept');
    expect(releaseAction(['t1', 't2'], 't1', true)).toBe('kept');
  });

  it('keeps a person that does not carry the tenant (already detached, or foreign)', () => {
    expect(releaseAction(['t2'], 't1', false)).toBe('kept');
    expect(releaseAction([], 't1', false)).toBe('kept');
  });

  it('never releases a system person', () => {
    expect(releaseAction(['system', 't1'], 't1', false)).toBe('kept');
  });
});

describe('addressReleasePatch', () => {
  it('archives an address of this tenant only', () => {
    expect(addressReleasePatch({ tenants: ['t1'], isArchived: false }, 't1')).toEqual({ isArchived: true });
  });

  it('removes the tenant from an address shared with another tenant', () => {
    expect(addressReleasePatch({ tenants: ['t1', 't2'], isArchived: false }, 't1')).toEqual({ tenants: ['t2'] });
  });

  it('writes nothing for an address already archived, foreign, or of the system tenant', () => {
    expect(addressReleasePatch({ tenants: ['t1'], isArchived: true }, 't1')).toBeUndefined();
    expect(addressReleasePatch({ tenants: ['t2'], isArchived: false }, 't1')).toBeUndefined();
    expect(addressReleasePatch({ tenants: ['system', 't1'], isArchived: false }, 't1')).toBeUndefined();
    expect(addressReleasePatch({}, 't1')).toBeUndefined();
  });
});

describe('isActiveMembership', () => {
  const today = '20261121';
  it('counts an open membership and one that ends today or later', () => {
    expect(isActiveMembership({ dateOfExit: '' }, today)).toBe(true);
    expect(isActiveMembership({}, today)).toBe(true);
    expect(isActiveMembership({ dateOfExit: '99991231' }, today)).toBe(true);
    expect(isActiveMembership({ dateOfExit: today }, today)).toBe(true);
  });

  it('does not count an ended or archived membership', () => {
    expect(isActiveMembership({ dateOfExit: '20261120' }, today)).toBe(false);
    expect(isActiveMembership({ dateOfExit: '', isArchived: true }, today)).toBe(false);
  });
});

describe('isActiveSubscription', () => {
  it('counts only an unarchived subscription without exit date', () => {
    expect(isActiveSubscription({ dateOfExit: '' })).toBe(true);
    expect(isActiveSubscription({ dateOfExit: '20261121' })).toBe(false);
    expect(isActiveSubscription({ dateOfExit: '', isArchived: true })).toBe(false);
    expect(isActiveSubscription({})).toBe(true);
    expect(isActiveSubscription({ dateOfExit: null })).toBe(true);
  });
});

describe('avatarListHolds', () => {
  it('finds the person in a (dotted) AvatarInfo array, a missing modelType read as person', () => {
    expect(avatarListHolds({ admins: [{ key: 'p1', modelType: 'person' }] }, 'admins', 'p1')).toBe(true);
    expect(avatarListHolds({ properties: { persons: [{ key: 'p1' }] } }, 'properties.persons', 'p1')).toBe(true);
  });

  it('ignores an org with the same key, other persons, a missing array and an empty key', () => {
    expect(avatarListHolds({ admins: [{ key: 'p1', modelType: 'org' }] }, 'admins', 'p1')).toBe(false);
    expect(avatarListHolds({ admins: [{ key: 'p2' }, null] }, 'admins', 'p1')).toBe(false);
    expect(avatarListHolds({}, 'properties.persons', 'p1')).toBe(false);
    expect(avatarListHolds({ admins: [{ key: '' }] }, 'admins', '')).toBe(false);
  });
});
