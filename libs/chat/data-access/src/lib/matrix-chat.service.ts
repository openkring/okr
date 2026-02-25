
import { Injectable } from '@angular/core';
import { createClient, MatrixClient, MatrixEvent, Room, RoomMember, EventType, MsgType, RelationType, IContent, ISendEventResponse, MatrixError, RoomStateEvent, RoomEvent, ClientEvent, ICreateRoomOpts, Visibility, Preset, User } from 'matrix-js-sdk';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { MatrixConfig, MatrixMessage, MatrixRoom, TypingNotification } from '@bk2/shared-models';

@Injectable({
  providedIn: 'root'
})
export class MatrixChatService {
  private client: MatrixClient | null = null;
  private syncState$ = new BehaviorSubject<string>('STOPPED');
  private rooms$ = new BehaviorSubject<MatrixRoom[]>([]);
  private messages$ = new Map<string, BehaviorSubject<MatrixMessage[]>>();
  private typing$ = new Subject<TypingNotification>();
  private errors$ = new Subject<MatrixError>();
  private readonly roomsUpdateTrigger$ = new Subject<void>();
  private roomsUpdateSub: Subscription | null = null;
  private readonly _mediaCache = new Map<string, string>(); // mxc:// -> blob URL

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
      console.log('MatrixChatService: Initializing client with config:', {
        homeserverUrl: url,
        userId: config.userId,
        deviceId: config.deviceId,
        hasAccessToken: !!config.accessToken
      });

      this.client = createClient({
        baseUrl: url,
        accessToken: config.accessToken,
        userId: config.userId,
        deviceId: config.deviceId,
        timelineSupport: true,
        useAuthorizationHeader: true,
      });

      this.setupEventHandlers();
      
      console.log('MatrixChatService: Starting client sync with initialSyncLimit=10');
      
      // Start the client sync with reduced limit for faster initial sync
      await this.client.startClient({ initialSyncLimit: 10 });
      console.log('MatrixChatService: Client startClient() completed');
      
      // Wait for initial sync to reach PREPARED state (with timeout)
      const syncReady = await this.waitForSyncState('PREPARED', 30000).catch(() => {
        console.warn('MatrixChatService: Initial sync timeout after 30s');
        
        // After timeout, check if we have rooms - if so, consider it "ready enough"
        const rooms = this.client?.getRooms() || [];
        if (rooms.length > 0 || this.syncState$.value === 'SYNCING') {
          console.log('MatrixChatService: Forcing sync state to PREPARED (have rooms or actively syncing)');
          this.syncState$.next('PREPARED');
          this.updateRoomsList();
          return true;
        }
        
        return false;
      });
      
      if (syncReady) {
        console.log('MatrixChatService: Initial sync completed successfully');
      } else {
        console.warn('MatrixChatService: Proceeding without successful sync');
      }
    } catch (error) {
      console.error('MatrixChatService: Failed to initialize client', error);
      throw error;
    }
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
      console.log('MatrixChatService: Client disconnected');
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
      console.log('MatrixChatService: Sync state changed:', {
        state,
        prevState,
        syncedRooms: this.client?.getRooms()?.length || 0,
        data
      });
      
      this.syncState$.next(state);
      
      if (state === 'PREPARED') {
        console.log('MatrixChatService: Initial sync complete, updating rooms list');
        this.updateRoomsList();
      } else if (state === 'ERROR') {
        console.error('MatrixChatService: Sync error', data);
        if (data?.error) {
          // Cast to MatrixError or wrap it
          const matrixError = data.error as MatrixError;
          this.errors$.next(matrixError);
        }
      }
    });

    // Room events
    this.client.on(RoomEvent.Timeline, (event: MatrixEvent, room: Room | undefined) => {
/*       console.log(`MatrixChatService: Timeline event`, {
        roomId: room?.roomId,
        eventType: event.getType(),
        eventId: event.getId(),
        isRoomMessage: event.getType() === EventType.RoomMessage
      }); */
      
      if (room && event.getType() === EventType.RoomMessage) {
        this.handleNewMessage(event, room);
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
  }

  /**
   * Wait for sync to reach a specific state
   */
  private waitForSyncState(targetState: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Check if already in target state
      if (this.syncState$.value === targetState) {
        resolve(true);
        return;
      }

      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error(`Sync state timeout waiting for ${targetState}`));
      }, timeoutMs);

      const subscription = this.syncState$.subscribe(state => {
        console.log('MatrixChatService: waitForSyncState observed:', state, 'waiting for:', targetState);
        if (state === targetState) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve(true);
        } else if (state === 'ERROR') {
          clearTimeout(timeout);
          subscription.unsubscribe();
          reject(new Error('Sync error'));
        }
      });
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
   * Get messages for a specific room
   */
  public getMessagesForRoom(roomId: string): Observable<MatrixMessage[]> {
    if (!this.messages$.has(roomId)) {
      this.messages$.set(roomId, new BehaviorSubject<MatrixMessage[]>([]));
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
      
      console.log(`MatrixChatService: Loading messages for room ${roomId}, found ${events.length} events in timeline`);
      
      // If we have few or no events, try to paginate back to load more
      if (events.length < 20) {
  //      console.log('MatrixChatService: Timeline has few events, attempting to paginate back');
        try {
          // Paginate backwards to load more messages
          await this.client.paginateEventTimeline(timeline, { backwards: true, limit: 50 });
   //       console.log(`MatrixChatService: After pagination, timeline has ${timeline.getEvents().length} events`);
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
            if ((msg.type === 'm.image' || msg.type === 'm.file') && mxcUrl) {
              return { ...msg, mediaUrl: await this.resolveMediaUrl(mxcUrl) };
            }
            return msg;
          })
      );

      console.log(`MatrixChatService: Loaded ${messages.length} messages for room ${roomId}`);

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
/*     console.log(`MatrixChatService: New message in room ${room.roomId}`, {
      eventId: event.getId(),
      sender: event.getSender(),
      type: event.getType(),
      content: event.getContent()
    }); */
    
    const message = this.mapEventToMessage(event, room);
    const subject = this.messages$.get(room.roomId);

    if (subject) {
      subject.next([...subject.value, message]);
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
      senderAvatar: this.getAvatarUrl(sender as any as User, 32),
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
private updateRoomsList(): void {
  if (!this.client) return;

  const rooms = this.client.getRooms();
  console.log(`MatrixChatService: Updating rooms list - ${rooms.length} rooms found`);

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

      // Calculate unread count (highlight + notifications)
      const unreadCount = (room as any).getUnreadNotificationCount?.('total') || 0;
      const highlightCount = (room as any).getUnreadNotificationCount?.('highlight') || 0;

      // Room avatar (Element-style: 48×48 cropped)
      const avatarUrl = room.getAvatarUrl(
        this.client!.baseUrl,
        48,
        48,
        'crop',
        true // allow default avatar
      ) || undefined;

      // Determine room name (fallback to members if no name)
      let name = room.name;
      if (!name || name === room.roomId) {
        const members = room.getJoinedMembers();
        if (members.length === 2) {
          // Direct chat: show the other person's name
          const other = members.find(m => m.userId !== this.client!.getUserId());
          name = other?.rawDisplayName || 'Unnamed chat';
        } else {
          name = `Group (${members.length})`;
        }
      }

      return {
        roomId: room.roomId,
        name,
        avatar: avatarUrl,
        topic: room.getCanonicalAlias() || undefined,
        isDirect: this.isDirectRoom(room),
        unreadCount: unreadCount + highlightCount,
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

  // Emit the new sorted list
  this.rooms$.next(matrixRooms);
}

  /**
   * Check if a room is a direct message room
   */
  private isDirectRoom(room: Room): boolean {
    const dmEvent = this.client?.getAccountData('m.direct' as any);
    if (!dmEvent) return false;

    const directRooms = dmEvent.getContent();
    for (const userId in directRooms) {
      if (directRooms[userId].includes(room.roomId)) {
        return true;
      }
    }
    return false;
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
   * Send read receipt
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
   * Create a new direct message room
   */
  async createDirectRoom(userId: string): Promise<Room> {
    if (!this.client) throw new Error('Client not initialized');

    const opts: ICreateRoomOpts = {
      preset: Preset.TrustedPrivateChat,
      is_direct: true,
      visibility: Visibility.Private,
      invite: [userId],
    };

    const result = await this.client.createRoom(opts);
    
    // Mark as direct room in account data
    await this.markRoomAsDirect(result.room_id, userId);

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
   * Invite a user to a room
   */
  async inviteUser(roomId: string, userId: string): Promise<void> {
    if (!this.client) return;
    await this.client.invite(roomId, userId);
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

    try {
 //     console.log('MatrixChatService: Fetching avatar from URL:', avatarUrl);

      // Fetch the image from the URL
      const response = await fetch(avatarUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch avatar: ${response.statusText}`);
      }

      // Convert to blob
      const blob = await response.blob();
      const file = new File([blob], 'avatar.jpg', { type: blob.type });

/*       console.log('MatrixChatService: Uploading avatar to Matrix', {
        size: file.size,
        type: file.type
      }); */

      // Upload the image file to Matrix content repository
      const upload = await this.client.uploadContent(file);
      const matrixAvatarUrl = upload.content_uri;

 //     console.log('MatrixChatService: Avatar uploaded, setting as user avatar:', matrixAvatarUrl);

      // Set the uploaded image as the user's avatar
      await this.client.setAvatarUrl(matrixAvatarUrl);

  //    console.log('MatrixChatService: Avatar set successfully');

      // Return the Matrix content URI (mxc://)
      return matrixAvatarUrl;
    } catch (error) {
      console.error('MatrixChatService: Failed to set user avatar from URL', error);
      throw error;
    }
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
}
