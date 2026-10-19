import { Functions, httpsCallable } from 'firebase/functions';

import { GroupRoomDrift } from '@okr/subject-group-util';

/**
 * Thin wrappers around the group-chat Cloud Functions (region europe-west6; the caller passes
 * `getFunctions(getApp(), 'europe-west6')`). One copy of each callable call, shared by the group
 * context menu and the AOC chat page's read-only drift scan.
 */

/**
 * Compares every group room of the tenant against its active memberships. Returns only the groups
 * that disagree (room members without a membership, or members missing from the room), the ones with
 * the most non-members first.
 */
export async function auditGroupRooms(functions: Functions, tenantId: string): Promise<GroupRoomDrift[]> {
  const fn = httpsCallable<{ tenantId: string }, { groups: GroupRoomDrift[] }>(functions, 'auditGroupRoomMembers');
  const { data } = await fn({ tenantId });
  return data.groups
    .filter(g => g.extras.length > 0 || g.missing.length > 0)
    .sort((a, b) => b.extras.length - a.extras.length);
}

/** Additive only: force-joins every person with an active membership into the group's room. */
export async function reconcileGroupRoomMembers(functions: Functions, groupId: string): Promise<{ roomId: string; joined: string[]; alreadyIn: string[]; extras: string[] }> {
  const fn = httpsCallable<{ groupId: string }, { roomId: string; joined: string[]; alreadyIn: string[]; extras: string[] }>(functions, 'reconcileGroupRoomMembers');
  return (await fn({ groupId })).data;
}

/** Re-applies the group's write-permission setting (postPolicy) to its room. */
export async function syncRoomPostPolicy(functions: Functions, groupId: string): Promise<{ result: 'unchanged' | 'applied' | 'no-room' }> {
  const fn = httpsCallable<{ groupId: string }, { result: 'unchanged' | 'applied' | 'no-room' }>(functions, 'syncRoomPostPolicy');
  return (await fn({ groupId })).data;
}

/**
 * Removes the given users from ONE group's room. The function re-verifies every id against the
 * current memberships, so a stale preview can never remove a real member (those come back in `refused`).
 */
export async function pruneGroupRoomExtras(functions: Functions, groupId: string, userIds: string[]): Promise<{ kicked: string[]; refused: string[] }> {
  const fn = httpsCallable<{ groupId: string; userIds: string[] }, { roomId: string; kicked: string[]; refused: string[] }>(functions, 'pruneGroupRoomExtras');
  const { data } = await fn({ groupId, userIds });
  return { kicked: data.kicked, refused: data.refused };
}
