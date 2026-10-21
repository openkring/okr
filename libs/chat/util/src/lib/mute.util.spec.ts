import { describe, expect, it } from 'vitest';

import {
  isAllMuted,
  isProtectedRoomAlias,
  isRoomMuted,
  MUTE_DURATIONS,
  muteUntil,
  parseMuteContent,
  withAllMute,
  withoutRoomMute,
  withRoomMute,
  MuteContent,
} from './mute.util';

const EMPTY: MuteContent = { all: {}, rooms: {} };

describe('muteUntil', () => {
  it('adds the duration to now', () => {
    expect(muteUntil('1h', 0)).toBe(3_600_000);
    expect(muteUntil('8h', 0)).toBe(28_800_000);
    expect(muteUntil('1w', 0)).toBe(604_800_000);
    expect(muteUntil('1h', 10)).toBe(3_600_010);
  });

  it('never expires for forever', () => {
    expect(muteUntil('forever', 0)).toBeNull();
    expect(MUTE_DURATIONS).toEqual(['1h', '8h', '1w', 'forever']);
  });
});

describe('parseMuteContent', () => {
  it('returns empty content for nothing', () => {
    expect(parseMuteContent(undefined)).toEqual(EMPTY);
    expect(parseMuteContent({})).toEqual(EMPTY);
  });

  it('keeps valid entries and drops malformed ones', () => {
    const parsed = parseMuteContent({
      all: { scs: null, kring: 'x', bad: -1 },
      rooms: { '!a': { until: 5 }, '!b': { until: null, byHide: true }, '!c': 'x', '!d': { until: 'x' } },
    });
    expect(parsed).toEqual({ all: { scs: null }, rooms: { '!a': { until: 5 }, '!b': { until: null, byHide: true } } });
  });

  it('tolerates wrong container types', () => {
    expect(parseMuteContent({ all: 'x', rooms: [] })).toEqual(EMPTY);
  });
});

describe('isRoomMuted', () => {
  const c: MuteContent = { all: {}, rooms: { '!a': { until: 100 }, '!f': { until: null } } };

  it('is muted before the expiry and when forever', () => {
    expect(isRoomMuted(c, '!a', 'scs', 99, false)).toBe(true);
    expect(isRoomMuted(c, '!f', 'scs', 99, false)).toBe(true);
  });

  it('is not muted at the expiry or for another room', () => {
    expect(isRoomMuted(c, '!a', 'scs', 100, false)).toBe(false);
    expect(isRoomMuted(c, '!x', 'scs', 0, false)).toBe(false);
  });

  it('is muted by the tenant-wide mute', () => {
    expect(isRoomMuted({ all: { scs: null }, rooms: {} }, '!x', 'scs', 0, false)).toBe(true);
  });

  it('never mutes a protected room', () => {
    const both: MuteContent = { all: { scs: null }, rooms: { '!a': { until: null } } };
    expect(isRoomMuted(both, '!a', 'scs', 0, true)).toBe(false);
  });
});

describe('isAllMuted', () => {
  it('is per tenant', () => {
    const c: MuteContent = { all: { scs: null }, rooms: {} };
    expect(isAllMuted(c, 'scs', 0)).toBe(true);
    expect(isAllMuted(c, 'kring', 0)).toBe(false);
  });

  it('ends at the expiry', () => {
    const c: MuteContent = { all: { scs: 10 }, rooms: {} };
    expect(isAllMuted(c, 'scs', 9)).toBe(true);
    expect(isAllMuted(c, 'scs', 10)).toBe(false);
  });
});

describe('withRoomMute', () => {
  it('adds a room mute without mutating and prunes expired entries', () => {
    const c: MuteContent = { all: { old: 5, keep: null }, rooms: { '!old': { until: 5 }, '!keep': { until: 500 } } };
    const next = withRoomMute(c, '!new', 900, 100);
    expect(next).toEqual({ all: { keep: null }, rooms: { '!keep': { until: 500 }, '!new': { until: 900 } } });
    expect(c.rooms['!old']).toEqual({ until: 5 });
  });

  it('marks a mute that comes from hiding', () => {
    expect(withRoomMute(EMPTY, '!a', null, 0, true).rooms['!a']).toEqual({ until: null, byHide: true });
  });
});

describe('withoutRoomMute', () => {
  const c: MuteContent = { all: {}, rooms: { '!user': { until: null }, '!hide': { until: null, byHide: true } } };

  it('removes any entry by default', () => {
    expect(withoutRoomMute(c, '!user', 0).rooms).toEqual({ '!hide': { until: null, byHide: true } });
  });

  it('removes only hide-made entries with onlyByHide', () => {
    expect(withoutRoomMute(c, '!user', 0, true).rooms['!user']).toEqual({ until: null });
    expect(withoutRoomMute(c, '!hide', 0, true).rooms['!hide']).toBeUndefined();
  });

  it('restores a user mute that hiding replaced', () => {
    const week = muteUntil('1w', 0);
    const user = withRoomMute(EMPTY, '!a', week, 0);
    const hidden = withRoomMute(user, '!a', null, 10, true);
    expect(hidden.rooms['!a']).toEqual({ until: null, byHide: true, prevUntil: week });
    expect(withoutRoomMute(hidden, '!a', 20, true).rooms['!a']).toEqual({ until: week });
  });

  it('drops the entry when the replaced user mute expired during the hide', () => {
    const hidden = withRoomMute(withRoomMute(EMPTY, '!a', 100, 0), '!a', null, 10, true);
    expect(withoutRoomMute(hidden, '!a', 200, true).rooms['!a']).toBeUndefined();
  });

  it('keeps prevUntil across a repeated hide and through parsing', () => {
    const hidden = withRoomMute(withRoomMute(EMPTY, '!a', null, 0), '!a', null, 1, true);
    const again = withRoomMute(hidden, '!a', null, 2, true);
    expect(again.rooms['!a']?.prevUntil).toBeNull();
    expect(parseMuteContent(JSON.parse(JSON.stringify(again)))).toEqual(again);
  });

  it('is immutable', () => {
    withoutRoomMute(c, '!user', 0);
    expect(c.rooms['!user']).toBeDefined();
  });
});

describe('withAllMute', () => {
  it('sets the tenant mute', () => {
    expect(withAllMute(EMPTY, 'scs', 500, 0).all).toEqual({ scs: 500 });
    expect(withAllMute(EMPTY, 'scs', null, 0).all).toEqual({ scs: null });
  });

  it('clears with undefined and leaves other tenants', () => {
    const c: MuteContent = { all: { scs: null, kring: null }, rooms: {} };
    expect(withAllMute(c, 'scs', undefined, 0).all).toEqual({ kring: null });
    expect(c.all['scs']).toBeNull();
  });

  it('prunes expired entries', () => {
    expect(withAllMute({ all: { kring: 5 }, rooms: {} }, 'scs', null, 10).all).toEqual({ scs: null });
  });
});

describe('isProtectedRoomAlias', () => {
  it('protects the support and Notfall rooms', () => {
    for (const a of ['group_scs_support', 'support', 'group_support', 'group_scs_notfall', 'notfall']) {
      expect(isProtectedRoomAlias(a, 'scs')).toBe(true);
    }
  });

  it('does not protect other rooms or other tenants\' support rooms', () => {
    for (const a of ['group_scs_vorstand', 'group_kring_support', 'supporters', '']) {
      expect(isProtectedRoomAlias(a, 'scs')).toBe(false);
    }
  });
});
