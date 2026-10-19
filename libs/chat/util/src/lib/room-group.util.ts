import type { GroupModel } from '@okr/shared-models';

/**
 * The key of the live group whose Matrix room this is, or undefined.
 *
 * `invitePersonToGroupRoom` and `kickPersonFromGroupRoom` take a `groupId`, not a room id: the
 * room is resolved server-side from the group. An admin room browser only knows the room, so it
 * maps back through `groups/{okey}.matrixRoomId` — the authoritative key of the room-identity
 * triple (see the matrix-chat skill). An archived group is ignored: its room is on its way out,
 * and inviting into it would re-admit someone to a chat the group no longer offers.
 */
export function groupKeyForRoom(roomId: string, groups: GroupModel[]): string | undefined {
  if (!roomId) return undefined;
  return groups.find(g => !g.isArchived && g.matrixRoomId === roomId)?.okey;
}
