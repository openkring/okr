import { describe, expect, it } from 'vitest';
import { ActivityModel } from '@bk2/shared-models';
import { AVATAR_INFO_SHAPE } from '@bk2/shared-models';
import { getActivityIndex, getActivityRoleNeeded, isActivity } from './activity.util';

const TENANT = 'scs';

function makeActivity(overrides: Partial<ActivityModel> = {}): ActivityModel {
  const a = new ActivityModel(TENANT);
  a.timestamp = '20260101120000';
  a.scope = 'person';
  a.action = 'create';
  a.author = { ...AVATAR_INFO_SHAPE, key: 'u1', name1: 'Max', name2: 'Muster' };
  Object.assign(a, overrides);
  return a;
}

describe('isActivity', () => {
  it('returns true for a valid ActivityModel', () => {
    expect(isActivity(makeActivity(), TENANT)).toBe(true);
  });
  it('returns false for a plain object', () => {
    expect(isActivity({ bkey: '' }, TENANT)).toBe(false);
  });
});

describe('getActivityIndex', () => {
  it('includes timestamp, scope, action, author name', () => {
    const idx = getActivityIndex(makeActivity());
    expect(idx).toContain('t:20260101120000');
    expect(idx).toContain('c:person');
    expect(idx).toContain('a:create');
    expect(idx).toContain('p:Max Muster');
  });

  it('omits author segment when author is undefined', () => {
    const idx = getActivityIndex(makeActivity({ author: undefined }));
    expect(idx).not.toContain('p:');
  });
});

describe('getActivityRoleNeeded', () => {
  it('returns registered for membership create (entry)', () => {
    expect(getActivityRoleNeeded('membership', 'create')).toBe('registered');
  });
  it('returns registered for membership delete (exit)', () => {
    expect(getActivityRoleNeeded('membership', 'delete')).toBe('registered');
  });
  it('returns registered for membership update (category change)', () => {
    expect(getActivityRoleNeeded('membership', 'update')).toBe('registered');
  });
  it('returns registered for person create (birth)', () => {
    expect(getActivityRoleNeeded('person', 'create')).toBe('registered');
  });
  it('returns registered for person delete (death)', () => {
    expect(getActivityRoleNeeded('person', 'delete')).toBe('registered');
  });
  it('returns registered for org create (foundation)', () => {
    expect(getActivityRoleNeeded('org', 'create')).toBe('registered');
  });
  it('returns registered for org delete (liquidation)', () => {
    expect(getActivityRoleNeeded('org', 'delete')).toBe('registered');
  });
  it('returns admin for auth login', () => {
    expect(getActivityRoleNeeded('auth', 'login')).toBe('admin');
  });
  it('returns admin for calevent create', () => {
    expect(getActivityRoleNeeded('calevent', 'create')).toBe('admin');
  });
  it('returns admin for chat join', () => {
    expect(getActivityRoleNeeded('chat', 'join')).toBe('admin');
  });
});
