/**
 * Bookkeeping for rooms evicted from the local Matrix store because the server no longer
 * knows them (SCS-AD, SCS-AS).
 *
 * `MatrixClient.store.removeRoom` only clears the in-memory store: the SDK's persisted sync
 * accumulator replays a purged room as "joined" on every app start, because the leave event
 * that would remove it there was purged with the room. Without a record that survives the
 * restart, each start opens the dead room once more, takes the 403 and heals again. The
 * record maps roomId → epoch ms of the eviction and lives in localStorage per Matrix user.
 */

/** Evicted rooms by roomId, value = epoch ms of the eviction. */
export type EvictedRooms = Record<string, number>;

/** Upper bound on remembered rooms; the oldest evictions drop out first. */
export const MAX_EVICTED_ROOMS = 50;

/** localStorage key for one Matrix account (a shared device may serve several people). */
export function evictedRoomsStorageKey(matrixUserId: string): string {
  return `chat:evictedRooms:${matrixUserId}`;
}

/** Parse the stored record; anything malformed yields an empty record. */
export function parseEvictedRooms(raw: string | null | undefined): EvictedRooms {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: EvictedRooms = {};
    for (const [roomId, evictedAt] of Object.entries(parsed)) {
      if (roomId.startsWith('!') && typeof evictedAt === 'number' && Number.isFinite(evictedAt)) {
        result[roomId] = evictedAt;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Add (or refresh) a room, keeping at most `max` entries — the most recent evictions win. */
export function recordEvictedRoom(rooms: EvictedRooms, roomId: string, now: number, max = MAX_EVICTED_ROOMS): EvictedRooms {
  const entries = Object.entries({ ...rooms, [roomId]: now })
    .sort(([, a], [, b]) => b - a)
    .slice(0, max);
  return Object.fromEntries(entries);
}

/**
 * Whether a replayed room must stay evicted.
 *
 * A purged room only ever carries the user's OLD membership event. A membership event newer
 * than the eviction means the server sent something real since — a re-invite or re-join of a
 * room that had merely been left — so the room is live again and must not be hidden.
 */
export function isStillEvicted(evictedAt: number, ownMembershipTs: number | undefined): boolean {
  return ownMembershipTs === undefined || ownMembershipTs <= evictedAt;
}

/** What re-applying the record at PREPARED does with one recorded room. */
export type EvictionAction = 'evict' | 'keep' | 'release';

/**
 * Decide what to do with a recorded eviction when the sync store (re)reaches PREPARED.
 *
 * - `evict`: the store replayed the room and it is still dead — remove it and keep the record.
 * - `keep`: the store does not hold the room right now — keep the record untouched. This is
 *   the normal case on the SECOND PREPARED: with a cached sync, matrix-js-sdk emits PREPARED
 *   once after replaying the cache (the room is evicted there) and once more after the first
 *   server /sync (the room is already gone). Dropping the record here would let the persisted
 *   sync accumulator replay the room on the next start unguarded (SCS-AS regression).
 * - `release`: an own membership event newer than the eviction arrived (re-invite/re-join) —
 *   the room is live again and the record must go.
 */
export function evictionAction(evictedAt: number, roomInStore: boolean, ownMembershipTs: number | undefined): EvictionAction {
  if (!roomInStore) return 'keep';
  return isStillEvicted(evictedAt, ownMembershipTs) ? 'evict' : 'release';
}
