import { inject, Injectable } from '@angular/core';
import { EventTimeline, MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

import { AppStore } from '@okr/shared-feature';
import { debugMessage } from '@okr/shared-util-core';

/**
 * Direct-message classification and the `m.direct` account-data reconciliation.
 *
 * Extracted from MatrixChatService (design review #4 / ARCH-2). A DM has no marker of its
 * own on Matrix — it is a room the account data happens to list under a user id — so
 * deciding "is this a DM" and keeping that list honest is one concern with one owner here.
 * The facade sets the client on initialize/disconnect; the room-list service asks this
 * service which rooms are DMs.
 */
@Injectable({
  providedIn: 'root'
})
export class MatrixDirectRoomService {
  private readonly appStore = inject(AppStore);
  private client: MatrixClient | null = null;

  setClient(client: MatrixClient | null): void {
    this.client = client;
  }

  /**
   * True if the room has an explicit m.room.name state event.
   * This is the reliable group-vs-DM discriminator: every group room is created with a
   * name, a DM never is. (room.name is unsuitable — the SDK synthesises a name for DMs
   * from the other member, so it is always non-empty.)
   */
  public roomHasName(room: Room): boolean {
    const ev = room.getLiveTimeline().getState(EventTimeline.FORWARDS)
      ?.getStateEvents('m.room.name', '') as MatrixEvent | null;
    const name = ev?.getContent()?.['name'];
    return typeof name === 'string' && name.trim().length > 0;
  }

  /**
   * Check if a room is a direct message room.
   * Guard: a room with an explicit name is always a group, never a DM — this prevents
   *   group rooms (including admin/bot-populated 2-member ones, S2) from rendering as
   *   DMs even if m.direct still carries a stale entry for them.
   * Primary: checks m.direct account data (set by markRoomAsDirect on creation).
   * Fallback: checks all current member state events for is_direct:true,
   *   which is present on the invitee's m.room.member event when a room was
   *   created with is_direct:true and the invitee hasn't joined yet.
   */
  public isDirectRoom(room: Room): boolean {
    if (this.roomHasName(room)) return false;

    const dmEvent = this.client?.getAccountData('m.direct' as any);
    if (dmEvent) {
      const directRooms = dmEvent.getContent() as Record<string, string[]>;
      for (const userId in directRooms) {
        if (directRooms[userId].includes(room.roomId)) {
          return true;
        }
      }
    }

    // Fallback: any current member state event with is_direct:true marks this as a DM
    const liveState = room.getLiveTimeline().getState(EventTimeline.FORWARDS);
    for (const member of room.getMembers()) {
      const memberEvent = liveState?.getStateEvents('m.room.member', member.userId) as MatrixEvent | null;
      if (memberEvent?.getContent()?.['is_direct'] === true) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find an existing direct message room with the given Matrix user ID.
   * Checks the m.direct account data and returns the first joined/invited room.
   */
  public findExistingDirectRoom(matrixUserId: string): string | undefined {
    if (!this.client) return undefined;
    const dmEvent = this.client.getAccountData('m.direct' as any);
    if (!dmEvent) return undefined;
    const directRooms = dmEvent.getContent() as Record<string, string[]>;
    const roomIds = directRooms[matrixUserId];
    if (!roomIds || roomIds.length === 0) return undefined;
    // Walk from most-recent to oldest; skip stale entries
    for (let i = roomIds.length - 1; i >= 0; i--) {
      const room = this.client.getRoom(roomIds[i]);
      if (!room) continue; // not in local cache at all
      const membership = room.getMyMembership();
      if (membership !== 'join' && membership !== 'invite') continue; // left or banned
      // Skip phantom rooms where the other user was never added (e.g. invite rejected by server)
      const otherPresent = room.getMembers().some(m =>
        m.userId !== this.client!.getUserId() &&
        (m.membership === 'join' || m.membership === 'invite')
      );
      if (!otherPresent) continue;
      return roomIds[i];
    }
    return undefined;
  }

  /**
   * Mark a room as direct in account data
   */
  public async markRoomAsDirect(roomId: string, userId: string): Promise<void> {
    if (!this.client) return;

    const dmEvent = this.client.getAccountData('m.direct' as any);
    const directRooms = dmEvent?.getContent() || {};

    if (!directRooms[userId]) {
      directRooms[userId] = [];
    }

    if (!directRooms[userId].includes(roomId)) {
      directRooms[userId].push(roomId);
    }

    await this.client.setAccountData('m.direct' as any, directRooms as any);
  }

  /**
   * After initial sync, reconcile m.direct account data so the room list classifies
   * DMs correctly (S2). Two passes:
   *  - PRUNE: drop entries whose (synced) room is clearly a group — has an m.room.name,
   *    a #group_ alias, or >2 joined members. This self-heals rooms that an earlier,
   *    over-eager version wrongly marked as DMs (e.g. group rooms temporarily down to
   *    two joined members, or an admin/bot 2-member room). Rooms not yet synced are
   *    left untouched (absence ≠ deleted).
   *  - ADD: register genuine DM-shaped rooms (exactly 2 joined members AND no name)
   *    that arrived without an m.direct entry (e.g. an incoming DM created by the peer).
   */
  public async repairDmRoomsAccountData(): Promise<void> {
    if (!this.client) return;
    const myUserId = this.client.getUserId();
    if (!myUserId) return;

    const dmEvent = this.client.getAccountData('m.direct' as any);
    const directRooms = structuredClone((dmEvent?.getContent() ?? {})) as Record<string, string[]>;
    let updated = false;

    // PRUNE — remove group rooms that were wrongly recorded as DMs.
    const isGroupRoom = (roomId: string): boolean => {
      const room = this.client!.getRoom(roomId);
      if (!room) return false; // not synced — cannot judge, keep
      if (this.roomHasName(room)) return true;
      if (room.getCanonicalAlias()?.startsWith('#group_')) return true;
      if (room.getJoinedMembers().length > 2) return true;
      return false;
    };
    for (const userId of Object.keys(directRooms)) {
      const kept = directRooms[userId].filter(roomId => !isGroupRoom(roomId));
      if (kept.length !== directRooms[userId].length) {
        updated = true;
        if (kept.length === 0) delete directRooms[userId];
        else directRooms[userId] = kept;
      }
    }

    // ADD — register genuine DM-shaped rooms not yet in m.direct.
    const knownDmRoomIds = new Set(Object.values(directRooms).flat());
    for (const room of this.client.getRooms()) {
      if (room.getMyMembership() !== 'join') continue;
      if (knownDmRoomIds.has(room.roomId)) continue;
      if (this.roomHasName(room)) continue; // named → group, never a DM
      if (room.getCanonicalAlias()?.startsWith('#group_')) continue;

      const joinedMembers = room.getJoinedMembers();
      if (joinedMembers.length !== 2) continue;

      const otherMember = joinedMembers.find(m => m.userId !== myUserId);
      if (!otherMember) continue;

      (directRooms[otherMember.userId] ??= []).push(room.roomId);
      updated = true;
    }

    if (updated) {
      await this.client.setAccountData('m.direct' as any, directRooms as any);
      debugMessage('MatrixDirectRoomService: reconciled m.direct account data', this.appStore.currentUser());
    }
  }
}
