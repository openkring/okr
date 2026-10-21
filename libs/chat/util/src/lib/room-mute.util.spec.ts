import { describe, expect, it } from 'vitest';

import { MuteContent } from './mute.util';
import { countUnmutedUnread, isListRoomMuted, mutedRoomIds } from './room-mute.util';

const NOW = 1_000_000;
const EMPTY: MuteContent = { all: {}, rooms: {} };
const room = (roomId: string, unreadCount = 0, topic?: string) => ({ roomId, unreadCount, topic });

describe('isListRoomMuted', () => {
  it('is false without any mute', () => {
    expect(isListRoomMuted(room('!a'), EMPTY, 'scs', NOW)).toBe(false);
  });

  it('follows an active room mute and ignores an expired one', () => {
    expect(isListRoomMuted(room('!a'), { all: {}, rooms: { '!a': { until: NOW + 1 } } }, 'scs', NOW)).toBe(true);
    expect(isListRoomMuted(room('!a'), { all: {}, rooms: { '!a': { until: NOW } } }, 'scs', NOW)).toBe(false);
    expect(isListRoomMuted(room('!a'), { all: {}, rooms: { '!a': { until: null } } }, 'scs', NOW)).toBe(true);
  });

  it('follows the all-mute of this tenant only', () => {
    const c: MuteContent = { all: { scs: null }, rooms: {} };
    expect(isListRoomMuted(room('!a'), c, 'scs', NOW)).toBe(true);
    expect(isListRoomMuted(room('!a'), c, 'kring', NOW)).toBe(false);
  });

  it('never mutes the support or Notfall room', () => {
    const c: MuteContent = { all: { scs: null }, rooms: { '!s': { until: null } } };
    expect(isListRoomMuted(room('!s', 0, '#group_scs_support:bk.host'), c, 'scs', NOW)).toBe(false);
    expect(isListRoomMuted(room('!s', 0, '#group_scs_notfall:bk.host'), c, 'scs', NOW)).toBe(false);
  });
});

describe('mutedRoomIds', () => {
  it('collects the muted rooms', () => {
    const c: MuteContent = { all: {}, rooms: { '!b': { until: null } } };
    expect([...mutedRoomIds([room('!a'), room('!b')], c, 'scs', NOW)]).toEqual(['!b']);
  });
});

describe('countUnmutedUnread', () => {
  const rooms = [room('!a', 3), room('!b', 5), room('!s', 2, '#group_scs_support:bk.host')];

  it('sums every unread count without mutes', () => {
    expect(countUnmutedUnread(rooms, EMPTY, 'scs', NOW)).toBe(10);
  });

  it('skips muted rooms', () => {
    expect(countUnmutedUnread(rooms, { all: {}, rooms: { '!b': { until: NOW + 10 } } }, 'scs', NOW)).toBe(5);
  });

  it('keeps only protected rooms when everything is muted', () => {
    expect(countUnmutedUnread(rooms, { all: { scs: null }, rooms: {} }, 'scs', NOW)).toBe(2);
  });

  it('counts a room again once its mute expired', () => {
    expect(countUnmutedUnread(rooms, { all: {}, rooms: { '!b': { until: NOW - 1 } } }, 'scs', NOW)).toBe(10);
  });
});
