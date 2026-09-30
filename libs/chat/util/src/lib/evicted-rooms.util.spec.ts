import { describe, expect, it } from 'vitest';
import { evictedRoomsStorageKey, evictionAction, isStillEvicted, parseEvictedRooms, recordEvictedRoom } from './evicted-rooms.util';

describe('evictedRoomsStorageKey', () => {
  it('scopes the key to the Matrix user', () => {
    expect(evictedRoomsStorageKey('@a:hs')).toBe('chat:evictedRooms:@a:hs');
  });
});

describe('parseEvictedRooms', () => {
  it('returns an empty record for null, empty or malformed input', () => {
    expect(parseEvictedRooms(null)).toEqual({});
    expect(parseEvictedRooms('')).toEqual({});
    expect(parseEvictedRooms('not json')).toEqual({});
    expect(parseEvictedRooms('[1,2]')).toEqual({});
    expect(parseEvictedRooms('42')).toEqual({});
  });

  it('keeps only room ids with a numeric timestamp', () => {
    const raw = JSON.stringify({ '!a:hs': 100, '!b:hs': 'x', 'c': 5, '!d:hs': null });
    expect(parseEvictedRooms(raw)).toEqual({ '!a:hs': 100 });
  });
});

describe('recordEvictedRoom', () => {
  it('adds a room without mutating the input', () => {
    const rooms = { '!a': 1 };
    expect(recordEvictedRoom(rooms, '!b', 2)).toEqual({ '!a': 1, '!b': 2 });
    expect(rooms).toEqual({ '!a': 1 });
  });

  it('refreshes the timestamp of a room already recorded', () => {
    expect(recordEvictedRoom({ '!a': 1 }, '!a', 9)).toEqual({ '!a': 9 });
  });

  it('drops the oldest evictions beyond the cap', () => {
    const result = recordEvictedRoom({ '!a': 1, '!b': 2, '!c': 3 }, '!d', 4, 3);
    expect(Object.keys(result).sort()).toEqual(['!b', '!c', '!d']);
  });
});

describe('isStillEvicted', () => {
  it('stays evicted when the own membership is older than or equal to the eviction', () => {
    expect(isStillEvicted(1000, 500)).toBe(true);
    expect(isStillEvicted(1000, 1000)).toBe(true);
  });

  it('stays evicted when no own membership event is known', () => {
    expect(isStillEvicted(1000, undefined)).toBe(true);
  });

  it('is released by a membership event newer than the eviction (re-invite / re-join)', () => {
    expect(isStillEvicted(1000, 1001)).toBe(false);
  });
});

describe('evictionAction', () => {
  it('keeps the record when the store does not hold the room (second PREPARED after a cached sync)', () => {
    expect(evictionAction(1000, false, undefined)).toBe('keep');
    expect(evictionAction(1000, false, 2000)).toBe('keep');
  });

  it('evicts a replayed room whose own membership is not newer than the eviction', () => {
    expect(evictionAction(1000, true, 500)).toBe('evict');
    expect(evictionAction(1000, true, undefined)).toBe('evict');
  });

  it('releases a replayed room re-invited or re-joined after the eviction', () => {
    expect(evictionAction(1000, true, 1001)).toBe('release');
  });
});
