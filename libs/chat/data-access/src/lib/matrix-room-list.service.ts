import { inject, Injectable } from '@angular/core';
import { EventTimeline, EventType, MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { MatrixMessage, MatrixRoom, TypingNotification } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { debugMessage } from '@okr/shared-util-core';
import { MATRIX_FAVOURITE_TAG, OKR_TENANT_EVENT } from '@okr/chat-util';
import { AvatarService } from '@okr/avatar-data-access';

import { isServiceAccount, mxcAvatarHttpUrl, personAvatarUrl } from './matrix-helpers';
import { MatrixMediaService } from './matrix-media.service';
import { MatrixDirectRoomService } from './matrix-direct-room.service';

/**
 * The chat room list: builds the `MatrixRoom[]` snapshot the sidebar renders, keeps it
 * ordered, and owns the state that only the list cares about (typing users per room,
 * stubs for rooms joined via Cloud Function, the favourite tag).
 *
 * Extracted from MatrixChatService (design review #4 / ARCH-2). The facade owns the SDK
 * event wiring and calls {@link triggerUpdate} / {@link updateRoomsList}; DM classification
 * comes from MatrixDirectRoomService.
 *
 * NOTE: the emitted list spans EVERY tenant — one Matrix account serves the person
 * everywhere. Tenant filtering happens once, in `MatrixChatStore.rooms` /
 * `getRoomsSync()`; never render this list directly.
 */
@Injectable({
  providedIn: 'root'
})
export class MatrixRoomListService {
  private readonly appStore = inject(AppStore);
  private readonly avatarService = inject(AvatarService);
  private readonly media = inject(MatrixMediaService);
  private readonly dm = inject(MatrixDirectRoomService);

  private client: MatrixClient | null = null;

  private readonly rooms$ = new BehaviorSubject<MatrixRoom[]>([]);
  // True once the first room list after the initial sync (PREPARED) has been emitted. `rooms`
  // starts as [] and is distinctUntilChanged, so a user with zero rooms never gets a second
  // emission — consumers that must tell "still loading" from "really empty" gate on this.
  private readonly roomsLoaded$ = new BehaviorSubject<boolean>(false);
  private readonly typing$ = new Subject<TypingNotification>();
  private readonly roomsUpdateTrigger$ = new Subject<void>();
  private roomsUpdateSub: Subscription | null = null;
  // C-2: serialize updateRoomsList() so two async runs can't emit out of order (older
  // list last). While a build runs, further triggers set a pending flag that schedules
  // exactly one more build afterwards, so the final emit always reflects the latest state.
  private roomsListInFlight = false;
  private roomsListPending = false;
  private readonly typingByRoom = new Map<string, string[]>(); // roomId -> typing userIds
  // Rooms joined via CF admin API that haven't appeared in a sync cycle yet.
  // updateRoomsList() re-injects stubs for these so the UI renders immediately.
  private readonly pendingRooms = new Map<string, string>(); // roomId → display name

  // ---- lifecycle, driven by the facade ----

  setClient(client: MatrixClient | null): void {
    this.client = client;
  }

  /**
   * (Re-)subscribe the debounced rebuild so rapid-fire Timeline/RoomState events collapse
   * into one update. Called from the facade's setupEventHandlers, which runs a second time
   * when client creation falls back to the in-memory store — hence the unsubscribe first.
   */
  startUpdateTrigger(): void {
    this.roomsUpdateSub?.unsubscribe();
    this.roomsUpdateSub = this.roomsUpdateTrigger$.pipe(debounceTime(300)).subscribe(() => this.updateRoomsList());
  }

  stopUpdateTrigger(): void {
    this.roomsUpdateSub?.unsubscribe();
    this.roomsUpdateSub = null;
  }

  /** Drop the per-session typing state (disconnect). */
  clearTyping(): void {
    this.typingByRoom.clear();
  }

  /** Detach from the client and emit an empty list (disconnect). */
  reset(): void {
    this.client = null;
    this.rooms$.next([]);
    this.roomsLoaded$.next(false);
  }

  // ---- outputs ----

  get rooms(): Observable<MatrixRoom[]> {
    // C-1: compare every field the UI renders, not just roomId/unread/lastMessage.timestamp.
    // The old comparator swallowed room renames, avatar changes and typing updates until an
    // unrelated field happened to change.
    return this.rooms$.asObservable().pipe(distinctUntilChanged((a, b) =>
      a.length === b.length && a.every((room, i) => {
        const o = b[i];
        return !!o &&
          room.roomId === o.roomId &&
          room.name === o.name &&
          room.avatar === o.avatar &&
          room.isDirect === o.isDirect &&
          room.unreadCount === o.unreadCount &&
          room.isFavourite === o.isFavourite &&
          room.lastMessage?.eventId === o.lastMessage?.eventId &&
          room.lastMessage?.timestamp === o.lastMessage?.timestamp &&
          room.lastMessage?.body === o.lastMessage?.body &&
          room.lastMessage?.isRedacted === o.lastMessage?.isRedacted &&
          room.typingUsers.length === o.typingUsers.length &&
          room.typingUsers.every((u, j) => u === o.typingUsers[j]);
      })
    ));
  }

  /** Synchronous snapshot of the current rooms list (BehaviorSubject value). */
  get roomsCurrentValue(): MatrixRoom[] {
    return this.rooms$.value;
  }

  /** Emits true once the room list reflects the initial sync; false again after disconnect. */
  get roomsLoaded(): Observable<boolean> {
    return this.roomsLoaded$.asObservable().pipe(distinctUntilChanged());
  }

  get typing(): Observable<TypingNotification> {
    return this.typing$.asObservable();
  }

  // ---- inputs ----

  /** Schedule a debounced rebuild of the room list. */
  triggerUpdate(): void {
    this.roomsUpdateTrigger$.next();
  }

  /** Record the users currently typing in a room and forward the notification. */
  noteTyping(roomId: string, users: string[]): void {
    this.typingByRoom.set(roomId, users);
    this.typing$.next({ roomId, users });
  }

  /** Mark the list as reflecting the initial sync (PREPARED). */
  markRoomsLoaded(): void {
    this.roomsLoaded$.next(true);
  }

  /**
   * Register a room that was joined via the CF admin API but hasn't appeared in a
   * sync cycle yet. updateRoomsList() will inject a stub for it on every rebuild
   * until the real room data arrives via sync.
   */
  registerPendingRoom(roomId: string, name: string): void {
    if (!this.pendingRooms.has(roomId)) {
      this.pendingRooms.set(roomId, name);
      this.triggerUpdate();
    }
  }

  /**
   * Pin or unpin a room for the current user by setting/removing its `m.favourite` tag. The
   * room list is not patched here: the homeserver echoes the change back as RoomEvent.Tags,
   * which rebuilds the list — the same path a pin made on another device takes.
   */
  public async setRoomFavourite(roomId: string, favourite: boolean): Promise<void> {
    if (!this.client) throw new Error('MatrixRoomListService.setRoomFavourite: client not initialized');
    if (favourite) {
      await this.client.setRoomTag(roomId, MATRIX_FAVOURITE_TAG, {});
    } else {
      await this.client.deleteRoomTag(roomId, MATRIX_FAVOURITE_TAG);
    }
  }

  /**
   * Update the rooms list observable with current room data.
   * Called after initial sync (PREPARED) and on relevant room events.
   *
   * C-2: serialized — a single build runs at a time. Triggers arriving mid-build coalesce
   * into exactly one follow-up build, so emits are always ordered and reflect the latest state.
   */
  public async updateRoomsList(): Promise<void> {
    if (this.roomsListInFlight) {
      this.roomsListPending = true;
      return;
    }
    this.roomsListInFlight = true;
    try {
      do {
        this.roomsListPending = false;
        await this.buildAndEmitRoomsList();
      } while (this.roomsListPending);
    } finally {
      this.roomsListInFlight = false;
    }
  }

  /** Build the room-list snapshot and emit it. Always invoked via the serialized updateRoomsList(). */
  private async buildAndEmitRoomsList(): Promise<void> {
    if (!this.client) return;

    const rooms = this.client.getRooms();
    debugMessage(`MatrixRoomListService: Updating rooms list - ${rooms.length} rooms found`, this.appStore.currentUser());

    const matrixRooms: MatrixRoom[] = rooms
      .filter(room => {
        // Skip rooms the user has left or that are not visible
        const myMembership = room.getMyMembership();
        return myMembership === 'join' || myMembership === 'invite';
      })
      .map(room => {
        // Get last message for preview
        const timeline = room.getLiveTimeline();
        const events = timeline.getEvents();
        let lastMessage: MatrixMessage | undefined;

        // Find the most recent m.room.message event
        for (let i = events.length - 1; i >= 0; i--) {
          const event = events[i];
          if (event.getType() === EventType.RoomMessage && !event.isRedacted()) {
            const content = event.getContent();
            const senderId = event.getSender();
            const sender = senderId ? this.client!.getUser(senderId) ?? undefined : undefined;
            const avatarUrl = personAvatarUrl(this.avatarService, senderId, 32)
              ?? mxcAvatarHttpUrl(this.client, sender, 32);

            lastMessage = {
              eventId: event.getId()!,
              roomId: room.roomId,
              sender: senderId || '',
              senderName: sender?.displayName || senderId?.split(':')[0].substring(1) || 'Unknown',
              senderAvatar: avatarUrl,
              body: content.body || '',
              timestamp: event.getTs(),
              type: content.msgtype || 'm.text',
              content: content,
              relatesTo: (content['m.relates_to']?.event_id && content['m.relates_to']?.rel_type) ? {
                eventId: content['m.relates_to'].event_id,
                relationType: content['m.relates_to'].rel_type
              } : undefined,
              reactions: undefined,
              isRedacted: event.isRedacted(),
              isEdited: !!content['m.new_content'],
            };
            break;
          }
        }

        // Calculate unread count. 'total' already includes highlights — do NOT add them again.
        const unreadCount = (room as any).getUnreadNotificationCount?.('total') || 0;

        const isDirect = this.dm.isDirectRoom(room);

        // For DM rooms: use the other member's display name and avatar
        // For group rooms: use room name/avatar with member-count fallback
        let name: string;
        let avatarUrl: string | undefined;
        // The DM counterpart's Matrix user id — the tenant filter resolves the DM's tenant from
        // it (the localpart is the person okey), so DMs need no room-state marker at all.
        let directUserId: string | undefined;

        if (isDirect) {
          const otherMember = room.getMembers().find(m =>
            m.userId !== this.client!.getUserId() &&
            !isServiceAccount(m.userId) && // never label a DM with a service/bot account (S1)
            (m.membership === 'join' || m.membership === 'invite')
          );
          if (otherMember) {
            // rawDisplayName is null when no display name is set.
            // otherMember.name falls back to the full "@user:server" string — skip it.
            directUserId = otherMember.userId;
            name = otherMember.rawDisplayName || otherMember.userId.split(':')[0].substring(1);
            // The tenant's own picture wins; otherwise the raw mxc:// URL, resolved to a blob
            // URL below via resolveMediaUrl (which skips anything that isn't mxc://).
            avatarUrl = personAvatarUrl(this.avatarService, otherMember.userId)
              ?? (otherMember as any)?.getMxcAvatarUrl?.() as string | undefined;
          } else {
            name = room.name || 'Direct message';
            avatarUrl = undefined;
          }
        } else {
          name = room.name;
          if (!name || name === room.roomId) {
            const members = room.getJoinedMembers();
            name = `Group (${members.length})`;
          }
          // Store raw mxc:// URL from room state; resolved to blob URL below
          const roomState = room.getLiveTimeline().getState(EventTimeline.FORWARDS);
          const avatarStateEvent = roomState?.getStateEvents('m.room.avatar', '');
          avatarUrl = (avatarStateEvent as MatrixEvent | null)?.getContent()?.url as string | undefined;
        }

        return {
          roomId: room.roomId,
          name,
          avatar: avatarUrl,
          topic: room.getCanonicalAlias() || undefined,
          isDirect,
          unreadCount,
          lastMessage,
          // P-2: the room-list entry no longer carries the full member array. It was
          // rebuilt for every room on every debounced event (O(rooms × members)) but is
          // not consumed by any list/preview UI — DM detection and naming above read
          // room.getMembers() from the SDK directly. Member-detail views resolve members
          // for the single open room on demand.
          members: [],
          typingUsers: this.typingByRoom.get(room.roomId) ?? [],
          tenants: this.getRoomTenants(room),
          directUserId,
          isFavourite: this.isFavouriteRoom(room),
          stateLoaded: this.isRoomStateLoaded(room),
        };
      })
      .sort((a, b) => {
        // Pinned rooms first — a room the user pinned stays at the top no matter where the last
        // message arrived. Within each group the ordering below is unchanged.
        if (!!a.isFavourite !== !!b.isFavourite) return a.isFavourite ? -1 : 1;
        // Sort by last message timestamp (most recent first), fallback to room name
        const timeA = a.lastMessage?.timestamp || 0;
        const timeB = b.lastMessage?.timestamp || 0;
        if (timeA !== timeB) return timeB - timeA;
        return a.name.localeCompare(b.name);
      });

    // Resolve all room avatar mxc:// URLs to authenticated blob URLs in parallel
    await Promise.all(matrixRooms.map(async r => {
      if (r.avatar?.startsWith('mxc://')) {
        r.avatar = await this.media.resolveMediaUrl(r.avatar) || undefined;
      }
    }));

    // Inject stubs for rooms joined via CF that haven't appeared in a sync cycle yet.
    // Once the real room data is present, remove the stub and let the real entry take over.
    //
    // The stub carries the CURRENT tenant: it exists only because this tenant's app just joined
    // the room via the Cloud Function, so there is no ambiguity. Without the marker the stub has
    // no tenant, no alias and no directUserId, and the tenant filter would show it everywhere —
    // for as long as the room stays pending, not just for a sync window.
    const stubTenants = this.appStore.tenantId() ? [this.appStore.tenantId()] : undefined;
    for (const [roomId, name] of this.pendingRooms) {
      if (matrixRooms.find(r => r.roomId === roomId)) {
        this.pendingRooms.delete(roomId); // real data is now in the list
      } else {
        matrixRooms.push({ roomId, name, isDirect: false, unreadCount: 0, members: [], typingUsers: [], tenants: stubTenants });
      }
    }

    // Emit the new sorted list
    this.rooms$.next(matrixRooms);
  }

  /**
   * Read the room's tenant marker (`org.okr.tenant` state event). Undefined for rooms
   * created before the marker existed — those stay visible in every tenant until
   * `backfillMatrixRoomTenants` stamps them.
   */
  private getRoomTenants(room: Room): string[] | undefined {
    const state = room.getLiveTimeline().getState(EventTimeline.FORWARDS);
    const tenants = state?.getStateEvents(OKR_TENANT_EVENT, '')?.getContent()?.['tenants'] as string[] | undefined;
    return tenants?.length ? tenants : undefined;
  }

  /**
   * Whether the user pinned this room (Matrix room tag `m.favourite`). Tags are account data,
   * so this is the same answer on every device the person uses.
   */
  private isFavouriteRoom(room: Room): boolean {
    return !!room.tags?.[MATRIX_FAVOURITE_TAG];
  }

  /**
   * Whether the room's state has actually been synced into the client yet.
   *
   * `m.room.create` is the first state event of every room and can never be absent from a
   * fully-loaded room, so its absence is a precise "state has not arrived yet" signal — unlike
   * the marker, the canonical alias or `m.room.name`, each of which a legitimate room may lack.
   *
   * This matters because updateRoomsList() runs on room/timeline events during the INITIAL sync,
   * before PREPARED. A room built in that window has no tenant marker and no alias, so the tenant
   * filter cannot place it and used to keep it — briefly showing another tenant's group room.
   */
  private isRoomStateLoaded(room: Room): boolean {
    const state = room.getLiveTimeline().getState(EventTimeline.FORWARDS);
    return !!state?.getStateEvents('m.room.create', '');
  }
}
