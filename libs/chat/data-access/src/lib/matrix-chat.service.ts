
import { inject, Injectable } from '@angular/core';
import { createClient, MatrixClient, MatrixEvent, Room, RoomMember, EventType, EventTimeline, MsgType, RelationType, IContent, ISendEventResponse, MatrixError, RoomStateEvent, RoomEvent, ClientEvent, ICreateRoomOpts, Visibility, Preset, User, createNewMatrixCall, CallEvent, type MatrixCall } from 'matrix-js-sdk';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { MatrixConfig, MatrixMessage, MatrixRoom, TypingNotification } from '@bk2/shared-models';
import { AppStore } from '@bk2/shared-feature';
import { debugData, debugMessage } from '@bk2/shared-util-core';

@Injectable({
  providedIn: 'root'
})
export class MatrixChatService {
  private appStore = inject(AppStore);
  
  private client: MatrixClient | null = null;
  private syncState$ = new BehaviorSubject<string>('STOPPED');
  private rooms$ = new BehaviorSubject<MatrixRoom[]>([]);
  private messages$ = new Map<string, BehaviorSubject<MatrixMessage[]>>();
  private typing$ = new Subject<TypingNotification>();
  private errors$ = new Subject<MatrixError>();
  private readonly roomsUpdateTrigger$ = new Subject<void>();
  private roomsUpdateSub: Subscription | null = null;
  private readonly _mediaCache = new Map<string, string>(); // mxc:// -> blob URL
  // Rooms joined via CF admin API that haven't appeared in a sync cycle yet.
  // updateRoomsList() re-injects stubs for these so the UI renders immediately.
  private readonly pendingRooms = new Map<string, string>(); // roomId → display name

  // ─── WebRTC call state ─────────────────────────────────────────────────────
  private readonly activeCall$ = new BehaviorSubject<MatrixCall | null>(null);
  private readonly callState$ = new BehaviorSubject<string | null>(null);
  /** Simplified feed info so consumers don't need a deep matrix-js-sdk import. */
  private readonly callFeeds$ = new BehaviorSubject<{ stream: MediaStream; isLocal: boolean }[]>([]);

  get isInitialized(): boolean {
    return this.client !== null;
  }

  get syncState(): Observable<string> {
    return this.syncState$.asObservable().pipe(distinctUntilChanged());
  }

  get rooms(): Observable<MatrixRoom[]> {
    return this.rooms$.asObservable().pipe(distinctUntilChanged((a, b) =>
      a.length === b.length && a.every((room, i) =>
        room.roomId === b[i]?.roomId &&
        room.unreadCount === b[i]?.unreadCount &&
        room.lastMessage?.timestamp === b[i]?.lastMessage?.timestamp
      )
    ));
  }

  /** Synchronous snapshot of the current rooms list (BehaviorSubject value). */
  get roomsCurrentValue(): MatrixRoom[] {
    return this.rooms$.value;
  }

  // ---- Credential storage helpers ----

  getStoredCredentials(): MatrixConfig | null {
    const accessToken = localStorage.getItem('matrix_access_token');
    const userId = localStorage.getItem('matrix_user_id');
    if (!accessToken || !userId) return null;
    let homeserverUrl = localStorage.getItem('matrix_homeserver') || '';
    if (homeserverUrl && !homeserverUrl.startsWith('https://')) homeserverUrl = 'https://' + homeserverUrl;
    return { accessToken, userId, deviceId: localStorage.getItem('matrix_device_id') || '', homeserverUrl };
  }

  storeCredentials(credentials: MatrixConfig): void {
    if (credentials.accessToken) localStorage.setItem('matrix_access_token', credentials.accessToken);
    if (credentials.userId) localStorage.setItem('matrix_user_id', credentials.userId);
    if (credentials.deviceId) localStorage.setItem('matrix_device_id', credentials.deviceId);
    if (credentials.homeserverUrl) localStorage.setItem('matrix_homeserver', credentials.homeserverUrl);
  }

  clearStoredCredentials(): void {
    ['matrix_access_token', 'matrix_user_id', 'matrix_device_id', 'matrix_homeserver']
      .forEach(key => localStorage.removeItem(key));
  }

  get typing(): Observable<TypingNotification> {
    return this.typing$.asObservable();
  }

  get errors(): Observable<MatrixError> {
    return this.errors$.asObservable();
  }

  get activeCall(): Observable<MatrixCall | null> {
    return this.activeCall$.asObservable();
  }

  get callState(): Observable<string | null> {
    return this.callState$.asObservable();
  }

  get callFeeds(): Observable<{ stream: MediaStream; isLocal: boolean }[]> {
    return this.callFeeds$.asObservable();
  }

  /**
   * Initialize the Matrix client with the given configuration
   */
  async initialize(config: MatrixConfig): Promise<void> {
    if (this.client) {
      console.warn('MatrixChatService: Client already initialized');
      return;
    }

    try {
      const url = config.homeserverUrl.startsWith('https://') ? config.homeserverUrl : 'https://' + config.homeserverUrl;
      debugData('MatrixChatService: Initializing client with config:', {
        homeserverUrl: url,
        userId: config.userId,
        deviceId: config.deviceId,
        hasAccessToken: !!config.accessToken
      }, this.appStore.currentUser());

      this.client = createClient({
        baseUrl: url,
        accessToken: config.accessToken,
        userId: config.userId,
        deviceId: config.deviceId,
        timelineSupport: true,
        useAuthorizationHeader: true,
      });

      this.setupEventHandlers();

      debugMessage('MatrixChatService: Starting client sync with initialSyncLimit=10', this.appStore.currentUser());

      // Start the client — sync happens in background via syncState$ events.
      // We don't wait for PREPARED here; doing so blocks the UI for up to 30 s on
      // slow networks (notably iOS). The store sets isMatrixInitialized=true right
      // after this returns, the spinner disappears, and rooms/messages update
      // reactively once PREPARED is reached.
      await this.client.startClient({ initialSyncLimit: 10 });
      debugMessage('MatrixChatService: Client started, sync in progress', this.appStore.currentUser());

      // Incoming calls are emitted directly on the MatrixClient (not on callEventHandler).
      // See: matrixClient.on("Call.incoming", function(call){ call.answer(); });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.client as any).on('Call.incoming', (call: MatrixCall) => {
        this.setupCallListeners(call);
        this.activeCall$.next(call);
        this.callState$.next('ringing');
      });
    } catch (error) {
      console.error('MatrixChatService: Failed to initialize client', error);
      this.client = null; // reset so a retry attempt can create a fresh client
      throw error;
    }
  }

  /**
   * Retrieve a room id by its name.
   * 
   */
  public async getRoomByName(name: string): Promise<string> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'getRoomByName');
    const result = await fn({ name });
    const { roomId } = result.data as { roomId: string };
    return roomId;
  }

  /**
   * Fetch a Matrix media URL with auth and return a blob URL.
   * Caches results to avoid redundant fetches.
   */
  private async resolveMediaUrl(mxcUrl: string | undefined): Promise<string> {
    if (!this.client || !mxcUrl || !mxcUrl.startsWith('mxc://')) return '';
    const cached = this._mediaCache.get(mxcUrl);
    if (cached) return cached;
    const httpUrl = this.client.mxcUrlToHttp(mxcUrl, undefined, undefined, undefined, false, true, true) ?? '';
    if (!httpUrl) return '';
    try {
      const accessToken = this.client.getAccessToken();
      const resp = await fetch(httpUrl, {
        headers: accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}
      });
      if (!resp.ok) return '';
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      this._mediaCache.set(mxcUrl, blobUrl);
      return blobUrl;
    } catch {
      return '';
    }
  }

  /**
   * Disconnect and cleanup the Matrix client
   */
  async disconnect(): Promise<void> {
    this.roomsUpdateSub?.unsubscribe();
    this.roomsUpdateSub = null;
    for (const url of this._mediaCache.values()) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
    this._mediaCache.clear();
    if (this.client) {
      this.client.stopClient();
      await this.client.clearStores();
      this.client = null;
      this.syncState$.next('STOPPED');
      debugMessage('MatrixChatService: Client disconnected', this.appStore.currentUser());
    }
  }

  /**
   * Set up event handlers for the Matrix client
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Debounce room list rebuilds so rapid-fire Timeline/RoomState events collapse into one update
    this.roomsUpdateSub?.unsubscribe();
    this.roomsUpdateSub = this.roomsUpdateTrigger$.pipe(debounceTime(300)).subscribe(() => this.updateRoomsList());

    // Sync state changes
    this.client.on(ClientEvent.Sync, (state, prevState, data) => {
/*       debugData('MatrixChatService: Sync state changed:', {
        state,
        prevState,
        syncedRooms: this.client?.getRooms()?.length || 0,
        data
      }, this.appStore.currentUser()); */
      
      this.syncState$.next(state);
      
      if (state === 'PREPARED') {
        debugMessage('MatrixChatService: Initial sync complete, updating rooms list', this.appStore.currentUser());
        this.repairDmRoomsAccountData().then(() => this.updateRoomsList());
      } else if (state === 'ERROR') {
        console.error('MatrixChatService: Sync error', data);
        if (data?.error) {
          // Cast to MatrixError or wrap it
          const matrixError = data.error as MatrixError;
          this.errors$.next(matrixError);
        }
      }
    });

    // Room events — live timeline only (toStartOfTimeline=true means historical/pagination events)
    this.client.on(RoomEvent.Timeline, (event: MatrixEvent, room: Room | undefined, toStartOfTimeline: boolean | undefined) => {
      if (toStartOfTimeline) return; // historical events are handled by loadMessagesForRoom
      if (room && event.getType() === EventType.RoomMessage) {
        this.handleNewMessage(event, room);
      }
    });

    // When a sent message is confirmed by the server, replace the local-echo entry
    // (temp ID like ~!room:id.$local) with the confirmed event (real server ID).
    this.client.on(RoomEvent.LocalEchoUpdated, (event: MatrixEvent, room: Room, oldEventId?: string) => {
      if (event.getType() !== EventType.RoomMessage) return;
      const subject = this.messages$.get(room.roomId);
      if (!subject) return;
      const msgs = subject.value;
      const oldIdx = oldEventId ? msgs.findIndex(m => m.eventId === oldEventId) : -1;
      const newMsg = this.mapEventToMessage(event, room);
      if (oldIdx >= 0) {
        // Replace the temp-ID entry in-place so the message doesn't jump around
        const updated = [...msgs];
        updated[oldIdx] = newMsg;
        subject.next(updated);
      } else {
        // No temp entry found — add if not already present
        if (!msgs.some(m => m.eventId === newMsg.eventId)) {
          subject.next([...msgs, newMsg]);
        }
      }
    });

    // Typing notifications
    this.client.on('RoomMember.typing' as any, (event: MatrixEvent, member: RoomMember) => {
      const room = this.client?.getRoom(member.roomId);
      if (room) {
        const typingMembers = room.currentState.getMembers().filter((m: any) => m.typing);
        const typingUsers = typingMembers.map((u: any) => u.userId);
        this.typing$.next({ roomId: room.roomId, users: typingUsers });
      }
    });

    // Room state updates (name, topic, avatar changes)
    this.client.on(RoomStateEvent.Events, (_event: MatrixEvent) => {
      this.roomsUpdateTrigger$.next();
    });

    // Read receipts — update room list so unread counts reflect the new read position
    this.client.on(RoomEvent.Receipt, () => {
      this.roomsUpdateTrigger$.next();
    });
  }

  public getCurrentUserId(): string | undefined {
    if (!this.client) return undefined;
    if (!this.client.getUserId()) return undefined;
    return this.client.getUserId() ?? undefined;
  }

  /**
   * Returns the current Matrix user, or undefined if not available.
   * A Matrix user has displayName: string and avatarUrl: string.
   * @returns the current matrix user
   */
  public getCurrentUser(): User | undefined {
    const uid = this.getCurrentUserId();
    if (!uid || !this.client) return undefined;
    return this.client.getUser(uid) ?? undefined;
  }

  /**
   * Returns the display name of a given matrix user, or the local part of their user ID as fallback.
   * you can use it with getCurrentUser() or a specific user from a message sender.
   * @param user the matrix user to get the display name for (can be obtained from getCurrentUser() or from a message sender)
   * @returns the display name of the user, or a fallback string if not available
   */
  public getCurrentDisplayName(user?: User): string | undefined {
    if (!user || !user.displayName) return undefined;
    return user.displayName || user.userId?.split(':')[0].substring(1) || 'You';
  }

  /**
   * Returns the avatar url of a given matrix user.
   * you can use it with getCurrentUser() or a specific user from a message sender.
   * @param user the user object to get the avatar for
   * @param size the desired size of the avatar (default: 96) - Matrix can generate different sizes from the original
   * @returns the avatar url of the user, or undefined if not available
   */
  public getAvatarUrl(user?: User, size: number = 96): string | undefined {
    if (!this.client) return undefined;
    if (!user || !user.avatarUrl) return undefined;
    return this.client!.mxcUrlToHttp(user.avatarUrl, size, size, 'crop', true) ?? undefined;
  }

  /**
   * Get messages for a specific room.
   * If the subject was previously created before the client was ready (empty subject,
   * no-op load), retry loading now that the client may be initialized.
   */
  public getMessagesForRoom(roomId: string): Observable<MatrixMessage[]> {
    if (!this.messages$.has(roomId)) {
      this.messages$.set(roomId, new BehaviorSubject<MatrixMessage[]>([]));
      this.loadMessagesForRoom(roomId);
    } else if (this.client && this.messages$.get(roomId)!.value.length === 0) {
      // Subject exists but is empty — was likely created before the client was ready.
      // Retry loading now that the client is initialized.
      this.loadMessagesForRoom(roomId);
    }
    return this.messages$.get(roomId)!.asObservable();
  }

  /**
   * Load messages for a room from the timeline
   */
  private async loadMessagesForRoom(roomId: string): Promise<void> {
    if (!this.client) return;

    const room = this.client.getRoom(roomId);
    if (!room) {
      console.warn('MatrixChatService: Room not found:', roomId);
      return;
    }

    try {
      const timeline = room.getLiveTimeline();
      const events = timeline.getEvents();
      
      debugMessage(`MatrixChatService: Loading messages for room ${roomId}, found ${events.length} events in timeline`, this.appStore.currentUser());
      
      // If we have few or no events, try to paginate back to load more
      if (events.length < 20) {
        debugMessage('MatrixChatService: Timeline has few events, attempting to paginate back', this.appStore.currentUser());
        try {
          // Paginate backwards to load more messages
          await this.client.paginateEventTimeline(timeline, { backwards: true, limit: 50 });
          debugMessage(`MatrixChatService: After pagination, timeline has ${timeline.getEvents().length} events`, this.appStore.currentUser());
        } catch (paginateError) {
          console.warn('MatrixChatService: Failed to paginate timeline:', paginateError);
        }
      }
      
      // Get all events from timeline and convert to messages, resolving media URLs
      const allEvents = timeline.getEvents();
      const messages = await Promise.all(
        allEvents
          .filter(e => e.getType() === EventType.RoomMessage)
          .map(async e => {
            const msg = this.mapEventToMessage(e, room);
            const mxcUrl = msg.content.url ?? msg.content.file?.url;
            const senderMember = room.getMember(e.getSender()!);
            const senderAvatarMxc = (senderMember as any)?.getMxcAvatarUrl?.() as string | undefined;
            const senderAvatar = senderAvatarMxc ? await this.resolveMediaUrl(senderAvatarMxc) : undefined;
            if ((msg.type === 'm.image' || msg.type === 'm.file') && mxcUrl) {
              return { ...msg, senderAvatar: senderAvatar || undefined, mediaUrl: await this.resolveMediaUrl(mxcUrl) };
            }
            return { ...msg, senderAvatar: senderAvatar || undefined };
          })
      );

      debugMessage(`MatrixChatService: Loaded ${messages.length} messages for room ${roomId}`, this.appStore.currentUser());

      const subject = this.messages$.get(roomId);
      if (subject) {
        subject.next(messages);
      }
    } catch (error) {
      console.error('MatrixChatService: Error loading messages for room:', error);
    }
  }

  /**
   * Handle new incoming messages
   */
  private handleNewMessage(event: MatrixEvent, room: Room): void {
    debugData(`MatrixChatService: New message in room ${room.roomId}`, {
      eventId: event.getId(),
      sender: event.getSender(),
      type: event.getType(),
      content: event.getContent()
    }, this.appStore.currentUser());
    
    const message = this.mapEventToMessage(event, room);
    const subject = this.messages$.get(room.roomId);

    if (subject) {
      // Deduplicate: the SDK can fire RoomEvent.Timeline more than once for the same event
      // (e.g. soft-failed → retried, or timeline rebuild). Replace if already present.
      const existing = subject.value.findIndex(m => m.eventId === message.eventId);
      if (existing >= 0) {
        const updated = [...subject.value];
        updated[existing] = message;
        subject.next(updated);
      } else {
        subject.next([...subject.value, message]);
      }
      // Async-resolve media URL and patch the message once fetched
      const mxcUrl = message.content.url ?? message.content.file?.url;
      if ((message.type === 'm.image' || message.type === 'm.file') && mxcUrl) {
        this.resolveMediaUrl(mxcUrl).then(url => {
          if (!url) return;
          const msgs = subject.value;
          const idx = msgs.findIndex(m => m.eventId === message.eventId);
          if (idx >= 0) {
            const updated = [...msgs];
            updated[idx] = { ...updated[idx], mediaUrl: url };
            subject.next(updated);
          }
        });
      }
      // Async-resolve sender avatar via authenticated fetch
      const senderMember = room.getMember(event.getSender()!);
      const senderAvatarMxc = (senderMember as any)?.getMxcAvatarUrl?.() as string | undefined;
      if (senderAvatarMxc) {
        this.resolveMediaUrl(senderAvatarMxc).then(url => {
          if (!url) return;
          const msgs = subject.value;
          const idx = msgs.findIndex(m => m.eventId === message.eventId);
          if (idx >= 0) {
            const updated = [...msgs];
            updated[idx] = { ...updated[idx], senderAvatar: url };
            subject.next(updated);
          }
        });
      }
    } else {
      console.warn(`MatrixChatService: No message subject found for room ${room.roomId}, message not added to list`);
    }

    this.roomsUpdateTrigger$.next();
  }

  /**
   * Convert a Matrix event to a MatrixMessage
   */
  private mapEventToMessage(event: MatrixEvent, room: Room): MatrixMessage {
    const sender = room.getMember(event.getSender()!);
    const content = event.getContent();
    const relatesTo = content['m.relates_to'];

    return {
      eventId: event.getId()!,
      roomId: room.roomId,
      sender: event.getSender()!,
      senderName: sender?.name || event.getSender()!,
      senderAvatar: undefined, // resolved asynchronously by callers via resolveMediaUrl
      body: content.body || '',
      timestamp: event.getTs(),
      type: content.msgtype || 'm.text',
      content: content,
      relatesTo: (relatesTo?.event_id && relatesTo?.rel_type) ? {
        eventId: relatesTo.event_id as string,
        relationType: relatesTo.rel_type as string
      } : undefined,
      isRedacted: event.isRedacted(),
      isEdited: !!relatesTo && relatesTo.rel_type === RelationType.Replace,
    };
  }

/**
 * Update the rooms list observable with current room data
 * Called after initial sync (PREPARED) and on relevant room events
 */
private async updateRoomsList(): Promise<void> {
  if (!this.client) return;

  const rooms = this.client.getRooms();
  debugMessage(`MatrixChatService: Updating rooms list - ${rooms.length} rooms found`, this.appStore.currentUser());

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
          const avatarUrl = this.getAvatarUrl(sender, 32);

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

      // Get typing users in this room
      const typingUserIds: string[] = [];
      // Optionally, you can fill this from room.currentState.getMembers().filter(m => m.typing)

      // Calculate unread count. 'total' already includes highlights — do NOT add them again.
      const unreadCount = (room as any).getUnreadNotificationCount?.('total') || 0;

      const isDirect = this.isDirectRoom(room);

      // For DM rooms: use the other member's display name and avatar
      // For group rooms: use room name/avatar with member-count fallback
      let name: string;
      let avatarUrl: string | undefined;

      if (isDirect) {
        const otherMember = room.getMembers().find(m =>
          m.userId !== this.client!.getUserId() &&
          (m.membership === 'join' || m.membership === 'invite')
        );
        if (otherMember) {
          // rawDisplayName is null when no display name is set.
          // otherMember.name falls back to the full "@user:server" string — skip it.
          name = otherMember.rawDisplayName || otherMember.userId.split(':')[0].substring(1);
          // Store raw mxc:// URL; resolved to blob URL below via resolveMediaUrl
          avatarUrl = (otherMember as any)?.getMxcAvatarUrl?.() as string | undefined;
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
        members: room.getMembers().map(m => ({
          userId: m.userId,
          displayName: m.name,
          avatarUrl: (m as any).getAvatarUrl?.(this.client!.baseUrl, 48, 48, 'crop') || undefined,
          membership: (m.membership || 'leave') as string,
        })),
        typingUsers: [],
      };
    })
    .sort((a, b) => {
      // Sort by last message timestamp (most recent first), fallback to room name
      const timeA = a.lastMessage?.timestamp || 0;
      const timeB = b.lastMessage?.timestamp || 0;
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name);
    });

  // Resolve all room avatar mxc:// URLs to authenticated blob URLs in parallel
  await Promise.all(matrixRooms.map(async r => {
    if (r.avatar?.startsWith('mxc://')) {
      r.avatar = await this.resolveMediaUrl(r.avatar) || undefined;
    }
  }));

  // Inject stubs for rooms joined via CF that haven't appeared in a sync cycle yet.
  // Once the real room data is present, remove the stub and let the real entry take over.
  for (const [roomId, name] of this.pendingRooms) {
    if (matrixRooms.find(r => r.roomId === roomId)) {
      this.pendingRooms.delete(roomId); // real data is now in the list
    } else {
      matrixRooms.push({ roomId, name, isDirect: false, unreadCount: 0, members: [], typingUsers: [] });
    }
  }

  // Emit the new sorted list
  this.rooms$.next(matrixRooms);
}

  /**
   * Check if a room is a direct message room.
   * Primary: checks m.direct account data (set by markRoomAsDirect on creation).
   * Fallback: checks all current member state events for is_direct:true,
   *   which is present on the invitee's m.room.member event when a room was
   *   created with is_direct:true and the invitee hasn't joined yet.
   */
  private isDirectRoom(room: Room): boolean {
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
    for (const member of room.currentState.getMembers()) {
      const memberEvent = room.currentState.getStateEvents('m.room.member', member.userId) as MatrixEvent | null;
      if (memberEvent?.getContent()?.['is_direct'] === true) {
        return true;
      }
    }

    return false;
  }

  /**
   * After initial sync, retroactively mark all 2-member rooms in m.direct account data.
   * This repairs DM rooms that were created without markRoomAsDirect (e.g. via Synapse
   * admin API or Element) so that isDirectRoom() correctly identifies them.
   */
  private async repairDmRoomsAccountData(): Promise<void> {
    if (!this.client) return;
    const myUserId = this.client.getUserId();
    if (!myUserId) return;

    const dmEvent = this.client.getAccountData('m.direct' as any);
    const directRooms = (dmEvent?.getContent() ?? {}) as Record<string, string[]>;
    const knownDmRoomIds = new Set(Object.values(directRooms).flat());

    let updated = false;
    for (const room of this.client.getRooms()) {
      if (room.getMyMembership() !== 'join') continue;
      if (knownDmRoomIds.has(room.roomId)) continue;
      // Obsolete/deleted rooms
      if (room.name?.startsWith('!!')) continue;
      // Group rooms identified by their canonical alias — never DMs regardless of member count
      const alias = room.getCanonicalAlias();
      if (alias?.startsWith('#group_')) continue;

      const joinedMembers = room.getJoinedMembers();
      if (joinedMembers.length !== 2) continue;

      const otherMember = joinedMembers.find(m => m.userId !== myUserId);
      if (!otherMember) continue;

      if (!directRooms[otherMember.userId]) directRooms[otherMember.userId] = [];
      if (!directRooms[otherMember.userId].includes(room.roomId)) {
        directRooms[otherMember.userId].push(room.roomId);
        updated = true;
      }
    }

    if (updated) {
      await this.client.setAccountData('m.direct' as any, directRooms as any);
      debugMessage('MatrixChatService: repaired m.direct account data for existing DM rooms', this.appStore.currentUser());
    }
  }

  /**
   * Send a text message to a room
   */
  async sendMessage(roomId: string, text: string, threadId?: string): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');

    const content: IContent = {
      msgtype: MsgType.Text,
      body: text,
    };

    if (threadId) {
      content['m.relates_to'] = {
        rel_type: RelationType.Thread,
        event_id: threadId,
      };
    }

    return this.client.sendEvent(roomId, EventType.RoomMessage, content as any);
  }

  /**
   * Send a file/image to a room
   */
  async sendFile(roomId: string, file: File, threadId?: string): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');

    // Upload the file
    const upload = await this.client.uploadContent(file);
    const url = upload.content_uri;

    const content: IContent = {
      msgtype: file.type.startsWith('image/') ? MsgType.Image : MsgType.File,
      body: file.name,
      url: url,
      info: {
        size: file.size,
        mimetype: file.type,
      },
    };

    if (threadId) {
      content['m.relates_to'] = {
        rel_type: RelationType.Thread,
        event_id: threadId,
      };
    }

    return this.client.sendEvent(roomId, EventType.RoomMessage, content as any);
  }

  /**
   * Send a location message
   */
  async sendLocation(roomId: string, text: string, latitude: number, longitude: number, threadId?: string): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');

    const content: IContent = {
      msgtype: MsgType.Location,
      body: text,
      geo_uri: `geo:${latitude},${longitude}`,
      info: {
        thumbnail_url: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&zoom=20&basemap=terrain`,
      },
    };

    if (threadId) {
      content['m.relates_to'] = {
        rel_type: RelationType.Thread,
        event_id: threadId,
      };
    }

    return this.client.sendEvent(roomId, EventType.RoomMessage, content as any);
  }

  /**
   * Edit a message
   */
  async editMessage(roomId: string, eventId: string, newText: string): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');

    const content: IContent = {
      msgtype: MsgType.Text,
      body: `* ${newText}`,
      'm.new_content': {
        msgtype: MsgType.Text,
        body: newText,
      },
      'm.relates_to': {
        rel_type: RelationType.Replace,
        event_id: eventId,
      },
    };

    return this.client.sendEvent(roomId, EventType.RoomMessage, content as any);
  }

  /**
   * React to a message
   */
  async reactToMessage(roomId: string, eventId: string, emoji: string): Promise<ISendEventResponse> {
    if (!this.client) throw new Error('Client not initialized');

    return this.client.sendEvent(roomId, EventType.Reaction, {
      'm.relates_to': {
        rel_type: RelationType.Annotation,
        event_id: eventId,
        key: emoji,
      },
    });
  }

  /**
   * Send typing notification
   */
  async sendTyping(roomId: string, isTyping: boolean, timeoutMs: number = 30000): Promise<void> {
    if (!this.client) return;
    await this.client.sendTyping(roomId, isTyping, timeoutMs);
  }

  /**
   * Send read receipt for a specific event.
   */
  async sendReadReceipt(roomId: string, eventId: string): Promise<void> {
    if (!this.client) return;
    const room = this.client.getRoom(roomId);
    if (!room) return;
    const event = room.findEventById(eventId);
    if (!event) return;
    await this.client.sendReadReceipt(event);
  }

  /**
   * Mark all messages in a room as read by sending a read receipt for the latest event.
   * This resets the unread count for the room on the server side.
   * The rooms$ observable is updated when the server acknowledges via RoomEvent.Receipt.
   */
  async markRoomAsRead(roomId: string): Promise<void> {
    if (!this.client) return;
    const room = this.client.getRoom(roomId);
    if (!room) return;
    const events = room.getLiveTimeline().getEvents();
    // Walk back to find the latest event that is not a state event
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.getId() && !event.isState()) {
        await this.client.sendReadReceipt(event);
        return;
      }
    }
  }

  /**
   * Register a room that was joined via the CF admin API but hasn't appeared in a
   * sync cycle yet. updateRoomsList() will inject a stub for it on every rebuild
   * until the real room data arrives via sync.
   */
  registerPendingRoom(roomId: string, name: string): void {
    if (!this.pendingRooms.has(roomId)) {
      this.pendingRooms.set(roomId, name);
      this.roomsUpdateTrigger$.next();
    }
  }

  /**
   * Find an existing direct message room with the given Matrix user ID.
   * Checks the m.direct account data and returns the first joined/invited room.
   */
  findExistingDirectRoom(matrixUserId: string): string | undefined {
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
   * Create a new direct message room, or return an existing one if it already exists.
   * @param userId full Matrix user ID (@localpart:server) or a Person.bkey (converted automatically)
   */
  async createDirectRoom(userId: string): Promise<Room> {
    if (!this.client) throw new Error('Client not initialized');

    // If userId is a Person.bkey (no leading @), convert to @localpart:server
    let matrixUserId = userId;
    if (!userId.startsWith('@')) {
      const hostname = new URL(this.client.baseUrl).hostname.replace('matrix.', '');
      matrixUserId = `@${userId.toLowerCase()}:${hostname}`;
    }

    // Find-or-create: return existing DM room if one already exists
    const existingRoomId = this.findExistingDirectRoom(matrixUserId);
    if (existingRoomId) {
      const existing = this.client.getRoom(existingRoomId);
      if (existing) return existing;
    }

    // Verify the target user exists; if not, provision them via the Cloud Function.
    // Note: Synapse's profile endpoint may return 404 briefly after admin-API user creation
    // (the profile row is only populated on first explicit profile set). So we trust the CF
    // result and do NOT re-check getProfileInfo after provisioning.
    try {
      await this.client.getProfileInfo(matrixUserId);
    } catch {
      const localpart = matrixUserId.split(':')[0].substring(1); // strip leading @
      debugMessage(`MatrixChatService.createDirectRoom: user not found, provisioning via CF for personKey=${localpart}`, this.appStore.currentUser());
      try {
        const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'provisionMatrixUser');
        const result = await fn({ personKey: localpart });
        debugData(`MatrixChatService.createDirectRoom: provisionMatrixUser succeeded:`, result.data, this.appStore.currentUser());
        // Trust the CF result — the user now exists on Synapse. Proceed to room creation.
      } catch (provisionError) {
        console.error(`MatrixChatService.createDirectRoom: failed to provision ${matrixUserId}:`, provisionError);
        throw new Error(`Could not provision Matrix account for ${matrixUserId}: ${provisionError}`);
      }
    }

    const opts: ICreateRoomOpts = {
      preset: Preset.TrustedPrivateChat,
      is_direct: true,
      visibility: Visibility.Private,
      invite: [matrixUserId],
    };

    const result = await this.client.createRoom(opts);

    // Mark as direct room in account data
    await this.markRoomAsDirect(result.room_id, matrixUserId);

    const room = this.client.getRoom(result.room_id);
    if (!room) throw new Error('Failed to get created room');

    return room;
  }

  /**
   * Create a group room
   */
  async createGroupRoom(name: string, userIds: string[], topic?: string, visibility = Visibility.Private): Promise<Room> {
    if (!this.client) throw new Error('Client not initialized');
    const preset = visibility === Visibility.Public ? Preset.PublicChat : Preset.PrivateChat;
    const opts: ICreateRoomOpts = {
      name: name,
      topic: topic,
      preset,
      visibility,
      invite: userIds,
    };

    const result = await this.client.createRoom(opts);
    const room = this.client.getRoom(result.room_id);
    if (!room) throw new Error('Failed to get created room');
    
    return room;
  }

  /**
   * Mark a room as direct in account data
   */
  private async markRoomAsDirect(roomId: string, userId: string): Promise<void> {
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
   * Join a room by ID or alias
   */
  async joinRoom(roomIdOrAlias: string): Promise<Room> {
    if (!this.client) throw new Error('Client not initialized');

    const result = await this.client.joinRoom(roomIdOrAlias);
    const room = this.client.getRoom(result.roomId);
    if (!room) throw new Error('Failed to get joined room');
    
    return room;
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: string): Promise<void> {
    if (!this.client) return;
    await this.client.leave(roomId);
  }


  /**
   * Get a room by ID
   */
  getRoom(roomId: string): Room | null {
    return this.client?.getRoom(roomId) || null;
  }

  /**
   * Get the current user ID
   */
  getUserId(): string | undefined {
    return this.client?.getUserId() || undefined;
  }

  /**
   * Search for users (if supported by homeserver)
   */
  async searchUsers(searchTerm: string, limit: number = 10): Promise<any[]> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      const result = await this.client.searchUserDirectory({ term: searchTerm, limit });
      return result.results || [];
    } catch (error) {
      console.error('MatrixChatService: User search failed', error);
      return [];
    }
  }

  /**
   * Set user avatar from existing URL
   * Downloads the image from the URL, uploads it to Matrix, and sets it as avatar
   */
  async setUserAvatarFromUrl(avatarUrl: string): Promise<string> {
    if (!this.client) throw new Error('Client not initialized');

    // Check localStorage cache to avoid re-uploading the same image every session
    const cachedFirebaseUrl = localStorage.getItem('matrix_avatar_firebase_url');
    const cachedMxcUrl = localStorage.getItem('matrix_avatar_mxc_url');
    if (cachedFirebaseUrl === avatarUrl && cachedMxcUrl) {
      return cachedMxcUrl;
    }

    try {
      // Fetch the image from the URL
      const response = await fetch(avatarUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch avatar: ${response.statusText}`);
      }

      // Convert to blob
      const blob = await response.blob();
      const file = new File([blob], 'avatar.jpg', { type: blob.type });

      // Upload the image file to Matrix content repository
      const upload = await this.client.uploadContent(file);
      const matrixAvatarUrl = upload.content_uri;

      // Set the uploaded image as the user's avatar
      await this.client.setAvatarUrl(matrixAvatarUrl);

      // Cache in localStorage to prevent re-uploading in future sessions
      localStorage.setItem('matrix_avatar_firebase_url', avatarUrl);
      localStorage.setItem('matrix_avatar_mxc_url', matrixAvatarUrl);

      return matrixAvatarUrl;
    } catch (error) {
      console.error('MatrixChatService: Failed to set user avatar from URL', error);
      throw error;
    }
  }

  /**
   * Set the avatar for a room by uploading an image from an HTTP URL.
   * Downloads the image, uploads it to the Matrix media repository,
   * then sends an m.room.avatar state event.
   */
  async setRoomAvatarFromUrl(roomId: string, imageUrl: string): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    if (!imageUrl || !imageUrl.startsWith('http')) return;

    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch room avatar: ${response.statusText}`);
    const blob = await response.blob();
    const file = new File([blob], 'room-avatar.jpg', { type: blob.type });
    const upload = await this.client.uploadContent(file);
    await this.client.sendStateEvent(roomId, 'm.room.avatar' as any, { url: upload.content_uri }, '');
  }

  /**
   * Update room name and/or topic.
   */
  async updateRoom(roomId: string, name?: string, topic?: string): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    if (name) await this.client.setRoomName(roomId, name);
    if (topic !== undefined) await this.client.setRoomTopic(roomId, topic);
  }

  /**
   * Invite a person (by personKey) to the Matrix chat room of a group.
   * Called when a new group membership is created.
   * The Cloud Function provisions the Matrix user if needed and force-joins them.
   */
  public async inviteToGroupRoom(groupId: string, personKey: string): Promise<void> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'invitePersonToGroupRoom');
    await fn({ groupId, personKey });
  }

  /**
   * Remove a person (by personKey) from the Matrix chat room of a group.
   * Called when a group membership is ended.
   */
  public async kickFromGroupRoom(groupId: string, personKey: string): Promise<void> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'kickPersonFromGroupRoom');
    await fn({ groupId, personKey });
  }

  /**
   * Get the current user's avatar URL
   */
  getUserAvatarUrl(width: number = 96, height: number = 96): string | undefined {
    if (!this.client) return undefined;

    const userId = this.client.getUserId();
    if (!userId) return undefined;

    const user = this.client.getUser(userId);
    if (!user) return undefined;

    return (user as any).getAvatarUrl?.(this.client.baseUrl, width, height, 'crop');
  }

  // ─── WebRTC calls ──────────────────────────────────────────────────────────

  async startVideoCall(roomId: string): Promise<void> {
    if (!this.client) throw new Error('Matrix not initialized');
    const call = createNewMatrixCall(this.client, roomId);
    if (!call) throw new Error('WebRTC not supported or room not found');
    this.setupCallListeners(call);
    this.activeCall$.next(call);
    await call.placeVideoCall();
    this.addLocalNotice(roomId, '📹 Video-Anruf gestartet');
  }

  hangupCall(): void {
    const call = this.activeCall$.value;
    if (call) call.hangup('user_hangup' as any, false);
  }

  async answerCall(): Promise<void> {
    const call = this.activeCall$.value;
    if (call) await call.answer(true, true);
  }

  private setupCallListeners(call: MatrixCall): void {
    call.on(CallEvent.FeedsChanged as any, (feeds: any[]) => {
      this.callFeeds$.next(
        feeds.map(f => ({ stream: f.stream as MediaStream, isLocal: f.isLocal() as boolean }))
      );
    });

    call.on(CallEvent.State as any, (state: string) => {
      this.callState$.next(state);
    });

    call.on(CallEvent.Hangup as any, () => {
      this.addLocalNotice(call.roomId, '📹 Video-Anruf beendet');
      this.activeCall$.next(null);
      this.callState$.next(null);
      this.callFeeds$.next([]);
    });
  }

  /** Inject a notice message directly into the local messages$ for a room (no network round-trip). */
  private addLocalNotice(roomId: string, body: string): void {
    const subject = this.messages$.get(roomId);
    if (!subject) return;
    subject.next([...subject.value, {
      eventId: `local-notice-${Date.now()}`,
      roomId,
      sender: this.client?.getUserId() || '',
      senderName: '',
      body,
      timestamp: Date.now(),
      type: 'm.notice',
      content: { msgtype: MsgType.Notice, body },
      isRedacted: false,
      isEdited: false,
    }]);
  }
}
