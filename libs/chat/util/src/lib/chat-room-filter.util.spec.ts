import { describe, expect, it } from 'vitest';
import { filterAdminRoomsByName, FilterableRoom } from './chat-room-filter.util';

const rooms: FilterableRoom[] = [
  { roomId: '!a:okr.ch', name: 'Vorstand', canonicalAlias: '#scs-vorstand:okr.ch' },
  { roomId: '!b:okr.ch', name: '', derivedName: 'DM: Anna ↔ Beat' },
  { roomId: '!c:okr.ch', name: 'general chat' },
];

describe('filterAdminRoomsByName', () => {
  it('returns all rooms for an empty query', () => {
    expect(filterAdminRoomsByName(rooms, '')).toHaveLength(3);
    expect(filterAdminRoomsByName(rooms, '   ')).toHaveLength(3);
  });

  it('matches case-insensitively on the name', () => {
    expect(filterAdminRoomsByName(rooms, 'VORST').map(r => r.roomId)).toEqual(['!a:okr.ch']);
  });

  it('matches on the derived name of a DM', () => {
    expect(filterAdminRoomsByName(rooms, 'beat').map(r => r.roomId)).toEqual(['!b:okr.ch']);
  });

  it('matches on the canonical alias and the room id', () => {
    expect(filterAdminRoomsByName(rooms, '#scs-').map(r => r.roomId)).toEqual(['!a:okr.ch']);
    expect(filterAdminRoomsByName(rooms, '!c:').map(r => r.roomId)).toEqual(['!c:okr.ch']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterAdminRoomsByName(rooms, 'zzz')).toEqual([]);
  });
});
