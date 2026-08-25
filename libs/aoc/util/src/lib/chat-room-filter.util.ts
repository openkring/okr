/** Minimal shape of an admin room needed for name filtering. */
export interface FilterableRoom {
  name?: string;
  derivedName?: string;
  canonicalAlias?: string;
  roomId: string;
}

/**
 * Filter admin rooms by a free-text query. Matches case-insensitively on the
 * room name, its derived name (DMs have no m.room.name), the canonical alias
 * and the room id — i.e. on everything the room list actually displays.
 */
export function filterAdminRoomsByName<T extends FilterableRoom>(rooms: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rooms;
  return rooms.filter(r =>
    (r.name ?? '').toLowerCase().includes(q) ||
    (r.derivedName ?? '').toLowerCase().includes(q) ||
    (r.canonicalAlias ?? '').toLowerCase().includes(q) ||
    r.roomId.toLowerCase().includes(q)
  );
}
