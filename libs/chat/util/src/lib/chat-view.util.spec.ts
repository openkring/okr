import { describe, expect, it } from 'vitest';
import { MatrixRoom } from '@okr/shared-models';
import { filterRoomsByName, resolveInitialRoomId, splitFavouriteRooms } from './chat-view.util';

function room(roomId: string, name: string): MatrixRoom {
  return { roomId, name, isDirect: false, unreadCount: 0, members: [], typingUsers: [] } as MatrixRoom;
}

describe('filterRoomsByName', () => {
  const rooms = [room('!a', 'General'), room('!b', 'Vorstand'), room('!c', 'general chat')];

  it('returns all rooms for an empty query', () => {
    expect(filterRoomsByName(rooms, '')).toHaveLength(3);
    expect(filterRoomsByName(rooms, '   ')).toHaveLength(3);
  });

  it('matches case-insensitively on a substring of the name', () => {
    const result = filterRoomsByName(rooms, 'gener');
    expect(result.map(r => r.roomId)).toEqual(['!a', '!c']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterRoomsByName(rooms, 'zzz')).toEqual([]);
  });

  it('tolerates a missing name', () => {
    const withMissing = [room('!x', undefined as unknown as string)];
    expect(filterRoomsByName(withMissing, 'a')).toEqual([]);
  });
});

describe('resolveInitialRoomId', () => {
  const rooms = [room('!a', 'A'), room('!b', 'B')];

  it('returns undefined when there are no rooms', () => {
    expect(resolveInitialRoomId('!a', [])).toBeUndefined();
  });

  it('returns the persisted room when it is still present', () => {
    expect(resolveInitialRoomId('!b', rooms)).toBe('!b');
  });

  it('falls back to the first room when the persisted room is gone', () => {
    expect(resolveInitialRoomId('!gone', rooms)).toBe('!a');
  });

  it('falls back to the first room when nothing is persisted', () => {
    expect(resolveInitialRoomId(undefined, rooms)).toBe('!a');
  });
});

describe('splitFavouriteRooms', () => {
  function pinned(roomId: string, name: string): MatrixRoom {
    return { ...room(roomId, name), isFavourite: true };
  }

  it('returns two empty lists for an empty room list', () => {
    expect(splitFavouriteRooms([])).toEqual({ favourites: [], others: [] });
  });

  it('puts every room in others when none is pinned', () => {
    const rooms = [room('!a', 'A'), room('!b', 'B')];
    expect(splitFavouriteRooms(rooms)).toEqual({ favourites: [], others: rooms });
  });

  it('lifts the pinned rooms out, keeping the incoming order on both sides', () => {
    const rooms = [room('!a', 'A'), pinned('!b', 'B'), room('!c', 'C'), pinned('!d', 'D')];
    const { favourites, others } = splitFavouriteRooms(rooms);
    expect(favourites.map(r => r.roomId)).toEqual(['!b', '!d']);
    expect(others.map(r => r.roomId)).toEqual(['!a', '!c']);
  });

  it('treats a missing isFavourite as not pinned', () => {
    const rooms = [{ ...room('!a', 'A'), isFavourite: undefined }];
    expect(splitFavouriteRooms(rooms).others).toHaveLength(1);
  });
});
