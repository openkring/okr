import { MatrixRoom } from '@okr/shared-models';

/**
 * Filter rooms by a case-insensitive substring of their name.
 * An empty/whitespace query returns the list unchanged.
 */
export function filterRoomsByName(rooms: MatrixRoom[], query: string): MatrixRoom[] {
  const q = query.trim().toLowerCase();
  if (!q) return rooms;
  return rooms.filter(r => (r.name ?? '').toLowerCase().includes(q));
}

/**
 * Decide which room to open first: the persisted room if it is still joined,
 * otherwise the first room in the list, otherwise undefined (no rooms).
 */
export function resolveInitialRoomId(
  persistedId: string | undefined,
  rooms: MatrixRoom[],
): string | undefined {
  if (rooms.length === 0) return undefined;
  if (persistedId && rooms.some(r => r.roomId === persistedId)) return persistedId;
  return rooms[0].roomId;
}

/**
 * Splits a room list into the pinned rooms and the rest, each keeping the order it came in.
 * The room list arrives sorted by last message; this only lifts the pinned ones out, so a pinned
 * room stays put when traffic arrives elsewhere.
 *
 * The personal notes room (`isNotes`) is always pinned and always comes first, pinned or not.
 */
export function splitFavouriteRooms(
  rooms: MatrixRoom[],
  isNotes: (room: MatrixRoom) => boolean = () => false,
): { favourites: MatrixRoom[]; others: MatrixRoom[] } {
  const notes: MatrixRoom[] = [];
  const favourites: MatrixRoom[] = [];
  const others: MatrixRoom[] = [];
  for (const room of rooms) {
    if (isNotes(room)) notes.push(room);
    else if (room.isFavourite) favourites.push(room);
    else others.push(room);
  }
  return { favourites: [...notes, ...favourites], others };
}
