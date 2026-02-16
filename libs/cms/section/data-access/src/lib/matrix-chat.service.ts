import { Injectable } from '@angular/core';
import { createClient, MatrixClient, MatrixEvent, Room, RoomMember, EventType, MsgType, RelationType, IContent, ISendEventResponse, MatrixError, RoomStateEvent, RoomEvent, ClientEvent, ICreateRoomOpts, Visibility, Preset } from 'matrix-js-sdk';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

export interface MatrixConfig {
  homeserverUrl: string;
  userId?: string;
  accessToken?: string;
  deviceId?: string;
}

export interface MatrixMessage {
  eventId: string;
  roomId: string;
  sender: string;
  senderName: string;
  senderAvatar?: string;
  body: string;
  timestamp: number;
  type: string;
  content: any;
  relatesTo?: {
    eventId: string;
    relationType: string;
  };
  reactions?: Map<string, Set<string>>; // emoji -> Set of user IDs
  isRedacted: boolean;
  isEdited: boolean;
}

export interface MatrixRoom {
  roomId: string;
  name: string;
  avatar?: string;
  topic?: string;
  isDirect: boolean;
  unreadCount: number;
  lastMessage?: MatrixMessage;
  members: MatrixMember[];
  typingUsers: string[];
}

export interface MatrixMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  membership: string;
}

export interface TypingNotification {
  roomId: string;
  users: string[];
}

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

  get isInitialized(): boolean {
    return this.client !== null;
  }

  get syncState(): Observable<string> {
    return this.syncState$.asObservable().pipe(distinctUntilChanged());
  }

  get rooms(): Observable<MatrixRoom[]> {
    return this.rooms$.asObservable().pipe(distinctUntilChanged((a, b) => 
      a.length === b.length && a.every((room, i) => room.roomId === b[i]?.roomId && room.unreadCount === b[i]?.unreadCount)
    ));
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
      console.log('MatrixChatService: Initializing client with config:', {
        homeserverUrl: config.homeserverUrl,
        userId: config.userId,
        deviceId: config.deviceId,
        hasAccessToken: !!config.accessToken
      });

      this.client = createClient({
        baseUrl: config.homeserverUrl,
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
      const syncReady = await this.waitForSyncState('PREPARED', 10000).catch(() => {
        console.warn('MatrixChatService: Initial sync timeout - continuing anyway');
        return false;
      });
      
      if (syncReady) {
        console.log('MatrixChatService: Initial sync completed successfully');
      } else {
        console.warn('MatrixChatService: Proceeding without waiting for sync completion');
      }
    } catch (error) {
      console.error('MatrixChatService: Failed to initialize client', error);
      throw error;
    }
  }

  /**
   * Disconnect and cleanup the Matrix client
   */
  async disconnect(): Promise<void> {
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
    this.client.on(RoomStateEvent.Events, (event: MatrixEvent) => {
      this.updateRoomsList();
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

  /**
   * Get messages for a specific room
   */
  getMessagesForRoom(roomId: string): Observable<MatrixMessage[]> {
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

    const timeline = room.getLiveTimeline();
    const events = timeline.getEvents();
    const messages = events
      .filter(e => e.getType() === EventType.RoomMessage)
      .map(e => this.eventToMessage(e, room));

    const subject = this.messages$.get(roomId);
    if (subject) {
      subject.next(messages);
    }
  }

  /**
   * Handle new incoming messages
   */
  private handleNewMessage(event: MatrixEvent, room: Room): void {
    const message = this.eventToMessage(event, room);
    const subject = this.messages$.get(room.roomId);
    
    if (subject) {
      const currentMessages = subject.value;
      subject.next([...currentMessages, message]);
    }

    this.updateRoomsList();
  }

  /**
   * Convert a Matrix event to a MatrixMessage
   */
  private eventToMessage(event: MatrixEvent, room: Room): MatrixMessage {
    const sender = room.getMember(event.getSender()!);
    const content = event.getContent();
    const relatesTo = content['m.relates_to'];

    return {
      eventId: event.getId()!,
      roomId: room.roomId,
      sender: event.getSender()!,
      senderName: sender?.name || event.getSender()!,
      senderAvatar: (sender as any)?.getAvatarUrl?.(this.client!.baseUrl, 48, 48, 'crop') || undefined,
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
   * Update the rooms list
   */
  private updateRoomsList(): void {
    if (!this.client) return;

    const rooms = this.client.getRooms().map(room => this.roomToMatrixRoom(room));
    this.rooms$.next(rooms);
  }

  /**
   * Convert a Room to MatrixRoom
   */
  private roomToMatrixRoom(room: Room): MatrixRoom {
    const timeline = room.getLiveTimeline();
    const events = timeline.getEvents();
    const messageEvents = events.filter(e => e.getType() === EventType.RoomMessage);
    const lastEvent = messageEvents[messageEvents.length - 1];
    
    return {
      roomId: room.roomId,
      name: room.name,
      avatar: (room as any).getAvatarUrl?.(this.client!.baseUrl, 48, 48, 'crop') || undefined,
      topic: room.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent().topic,
      isDirect: this.isDirectRoom(room),
      unreadCount: (room as any).getUnreadNotificationCount('total') || 0,
      lastMessage: lastEvent ? this.eventToMessage(lastEvent, room) : undefined,
      members: room.getMembers().map(m => ({
        userId: m.userId,
        displayName: m.name,
        avatarUrl: (m as any).getAvatarUrl?.(this.client!.baseUrl, 48, 48, 'crop') || undefined,
        membership: (m.membership || 'leave') as string,
      })),
      typingUsers: room.currentState.getMembers().filter((m: any) => m.typing).map((u: any) => u.userId),
    };
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
  async createGroupRoom(name: string, userIds: string[], topic?: string): Promise<Room> {
    if (!this.client) throw new Error('Client not initialized');

    const opts: ICreateRoomOpts = {
      name: name,
      topic: topic,
      preset: Preset.PublicChat, // Make it a public room
      visibility: Visibility.Public, // Publish to room directory
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
}
