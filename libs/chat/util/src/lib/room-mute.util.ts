import { isProtectedRoomAlias, isRoomMuted, MuteContent } from './mute.util';
import { aliasLocalpartOf } from './room-details.util';

/** What the room-list mute helpers read from a room (a `MatrixRoom` fits). */
export interface MuteListRoom {
  roomId: string;
  /** Canonical alias (`#group_x:server`); support / Notfall rooms are recognised by it. */
  topic?: string;
  unreadCount: number;
}

/**
 * Whether a room in the list counts as muted (spec 1.109 §9): its own mute or «Alle
 * stummschalten» of this tenant. Support and Notfall rooms never are.
 */
export function isListRoomMuted(room: Pick<MuteListRoom, 'roomId' | 'topic'>, c: MuteContent, tenantId: string, now: number): boolean {
  return isRoomMuted(c, room.roomId, tenantId, now, isProtectedRoomAlias(aliasLocalpartOf(room.topic), tenantId));
}

/** Ids of the muted rooms among `rooms` (for the 🔕 in the room list). */
export function mutedRoomIds(rooms: readonly Pick<MuteListRoom, 'roomId' | 'topic'>[], c: MuteContent, tenantId: string, now: number): Set<string> {
  return new Set(rooms.filter((r) => isListRoomMuted(r, c, tenantId, now)).map((r) => r.roomId));
}

/** The chat unread total of the badges: muted rooms do not count (spec 1.109 §9). */
export function countUnmutedUnread(rooms: readonly MuteListRoom[], c: MuteContent, tenantId: string, now: number): number {
  return rooms.reduce((sum, r) => (r.unreadCount > 0 && !isListRoomMuted(r, c, tenantId, now) ? sum + r.unreadCount : sum), 0);
}
