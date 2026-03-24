import { AsyncPipe, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, PLATFORM_ID, computed, effect, inject, input, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { IonCard, IonCardContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonBadge, ToastController, ActionSheetOptions, ActionSheetController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { SpinnerComponent } from '@bk2/shared-ui';

import { MatrixMessageInput, MatrixMessageList, MatrixRoomList } from '@bk2/chat-ui';

import { MatrixChatStore } from './matrix-chat.store';
import { TranslatePipe } from '@bk2/shared-i18n';
import { debugMessage, hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, downloadToBrowser, showToast } from '@bk2/shared-util-angular';
import { MatrixMessage, RoleName } from '@bk2/shared-models';

@Component({
  selector: 'bk-matrix-chat-overview',
  standalone: true,
  imports: [
    SvgIconPipe, TranslatePipe, AsyncPipe,
    SpinnerComponent, MatrixRoomList, MatrixMessageList, MatrixMessageInput,
    IonCard, IonCardContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonBadge
  ],
  providers: [MatrixChatStore],
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;   /* stop browser scroll-into-view from escaping */
    }

    ion-card-content {
      padding: 0px;
      flex: 1;
      min-height: 0;      /* flex child must shrink below its content height */
      overflow: hidden;
    }

    ion-card {
      padding: 0px;
      margin: 0px;
      border: 0px;
      box-shadow: none !important;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-container {
      display: flex;
      height: 100%;
      overflow: hidden;
    }

    .room-list-column {
      flex-shrink: 0;
      width: 280px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      border-right: 1px solid var(--ion-border-color, #dedede);
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                  border-right-color 0.3s ease;
    }

    .room-list-column.collapsed {
      width: 0;
      border-right-color: transparent;
    }

    .messages-column {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex: 1;
      min-height: 0;
    }

    /* Message list fills remaining space; input is pushed to bottom */
    bk-matrix-message-list {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    bk-matrix-message-input {
      flex-shrink: 0;
    }

    .room-header {
      border-bottom: 1px solid var(--ion-border-color, #dedede);
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--ion-color-medium);
      flex-direction: column;
      gap: 16px;
      padding: 32px;
      text-align: center;
    }

    .sync-status {
      padding: 8px;
      text-align: center;
      font-size: 0.875rem;
      background: var(--ion-color-light);
      color: var(--ion-color-medium);
    }

    .video-call-overlay {
      position: absolute;
      inset: 0;
      background: #000;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .remote-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .local-video {
      position: absolute;
      bottom: 88px;
      right: 16px;
      width: 120px;
      border-radius: 12px;
      object-fit: cover;
      border: 2px solid rgba(255,255,255,0.4);
    }

    .call-status-label {
      position: absolute;
      top: 24px;
      left: 0; right: 0;
      text-align: center;
      color: #fff;
      font-size: 1rem;
      font-weight: 600;
      text-shadow: 0 1px 4px rgba(0,0,0,0.6);
    }

    .call-controls {
      position: absolute;
      bottom: 24px;
      left: 0; right: 0;
      display: flex;
      justify-content: center;
      gap: 24px;
    }

    .call-fab {
      --border-radius: 50%;
      width: 56px;
      height: 56px;
    }

    .messages-loading {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .thread-panel {
      width: 360px;
      min-width: 0;
      border-left: 1px solid var(--ion-border-color, #dedede);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--ion-background-color, #fff);
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                  border-left-color 0.3s ease;
    }

    .thread-panel.collapsed {
      width: 0;
      border-left-color: transparent;
    }

    @media (max-width: 767px) {
      .thread-panel {
        position: absolute;
        inset: 0;
        z-index: 50;
        width: 100%;
        background: var(--ion-background-color, #fff);
        transition: none;
      }

      .thread-panel.collapsed {
        width: 0;
      }
    }

    .thread-root-message {
      padding: 12px 16px;
      background: var(--ion-color-light);
      border-bottom: 2px solid var(--ion-border-color, #dedede);
      font-size: 0.9rem;
    }

    .thread-root-sender {
      font-weight: 600;
      color: var(--ion-color-primary);
      font-size: 0.75rem;
      margin-bottom: 4px;
    }

    .thread-root-body {
      color: var(--ion-color-dark);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .thread-empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ion-color-medium);
      font-size: 0.875rem;
      padding: 24px;
      text-align: center;
    }
  `],
  template: `
    @if (isMatrixReady()) {
      <ion-card style="position:relative">
        <!-- Sync status indicator - only show for non-ready states -->
        @if (syncState() !== 'PREPARED' && syncState() !== 'SYNCING') {
          <div class="sync-status">
            @switch (syncState()) {
              @case ('RECONNECTING') { 
                <ion-badge color="warning">{{ '@chat.fields.reconnecting' | translate | async}}</ion-badge>
              }
              @case ('ERROR') { 
                <ion-badge color="danger">{{ '@chat.fields.connectionError' | translate | async}}</ion-badge>
              }
              @default { 
                <ion-badge color="medium">{{ '@chat.fields.connecting' | translate | async}}</ion-badge>
              }
            }
          </div>
        }

        <ion-card-content class="ion-no-padding">
          <div class="chat-container">
            <!-- Room List (always in DOM; CSS width animates it in/out) -->
            <div class="room-list-column" [class.collapsed]="!showRoomList()">
              <ion-header class="room-header">
                <ion-toolbar>
                  <ion-buttons slot="start">
                    <ion-button (click)="toggleRoomList()" [disabled]="!currentRoom()">
                      <ion-icon src="{{'menu' | svgIcon}}"></ion-icon>
                    </ion-button>
                  </ion-buttons>
                  <ion-title>Chat-Räume</ion-title>
                  @if(hasRole('admin')) {
                    <ion-buttons slot="end">
                      <ion-button (click)="onCreateRoom()">
                        <ion-icon src="{{'add-circle' | svgIcon}}"></ion-icon>
                      </ion-button>
                    </ion-buttons>
                  }
                </ion-toolbar>
              </ion-header>

              <bk-matrix-room-list
                [rooms]="rooms()"
                [selectedRoomId]="currentRoomId()"
                (roomSelected)="onRoomSelected($event)"
              />
            </div>

            <!-- Messages Area -->
            <div class="messages-column" (click)="onMessagesColumnClicked()">
              @if (currentRoom()) {
                <!-- Room Header -->
                <ion-header class="room-header">
                  <ion-toolbar>
                    @if (!showRoomList() && !isGroupView()) {
                      <ion-buttons slot="start">
                        <ion-button (click)="toggleRoomList(); $event.stopPropagation()">
                          <ion-icon src="{{'menu' | svgIcon}}"></ion-icon>
                        </ion-button>
                      </ion-buttons>
                    }
                    
                    <ion-title>{{ currentRoom()?.name }}</ion-title>
                    @if(hasRole('admin')) {
                      <ion-buttons slot="end">
                        <ion-button (click)="onRoomInfo()">
                          <ion-icon src="{{'info-circle' | svgIcon}}"></ion-icon>
                        </ion-button>
                      </ion-buttons>
                    }
                  </ion-toolbar>
                </ion-header>

                <!-- Message List or Loading Spinner -->
                @if (isMessagesLoading()) {
                  <div class="messages-loading">
                    <bk-spinner />
                  </div>
                } @else {
                  <bk-matrix-message-list
                    [messages]="messages()"
                    [currentUserId]="matrixUserId()"
                    [homeserverUrl]="homeserverUrl()"
                    [typingUsers]="typingUsers()"
                    [threadReplyCounts]="threadReplyCounts()"
                    (messageClicked)="onMessageClicked($event)"
                    (imageClicked)="onImageClicked($event)"
                    (fileClicked)="onFileClicked($event)"
                    (reactionClicked)="onReactionClicked($event)"
                    (threadClicked)="onThreadClicked($event)"
                  />
                }

                <!-- Message Input -->
                <bk-matrix-message-input
                  [typingUsers]="typingUsers()"
                  [replyToMessage]="replyToMessage()"
                  (messageSent)="onMessageSent($event)"
                  (fileSent)="onFileSent($event)"
                  (locationSent)="onLocationSent()"
                  (videoCallStarted)="onVideoCallStarted()"
                  (typing)="onTyping($event)"
                  (cancelReplyClicked)="onCancelReply()"
                />
              } @else {
                <div class="empty-state">
                  <ion-icon src="{{'chatbubbles' | svgIcon}}" size="large"></ion-icon>
                  <div>
                    <h3>{{ '@chat.fields.selectRoom' | translate | async}}</h3>
                    @if (rooms().length === 0) {
                      <p>{{ '@chat.fields.noRoomsError' | translate | async}}</p>
                      <ion-button (click)="onCreateRoom()">{{ '@chat.fields.createTestRoom' | translate | async}}</ion-button>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- Thread Panel (always in DOM; CSS width animates it in/out) -->
            <div class="thread-panel" [class.collapsed]="!selectedThreadId()">
                <ion-header class="room-header">
                  <ion-toolbar>
                    <ion-title>Thread</ion-title>
                    <ion-buttons slot="end">
                      <ion-button (click)="onCloseThread()">
                        <ion-icon src="{{'close_cancel' | svgIcon}}"></ion-icon>
                      </ion-button>
                    </ion-buttons>
                  </ion-toolbar>
                </ion-header>

                @if (threadRootMessage(); as root) {
                  <div class="thread-root-message">
                    <div class="thread-root-sender">{{ root.senderName }}</div>
                    <div class="thread-root-body">{{ root.body }}</div>
                  </div>
                }

                @if (threadMessages().length === 0) {
                  <div class="thread-empty">{{'@chat.operation.thread.empty' | translate | async}}</div>
                } @else {
                  <bk-matrix-message-list
                    [messages]="threadMessages()"
                    [currentUserId]="matrixUserId()"
                    [homeserverUrl]="homeserverUrl()"
                    [typingUsers]="[]"
                    (messageClicked)="onMessageClicked($event)"
                    (imageClicked)="onImageClicked($event)"
                    (fileClicked)="onFileClicked($event)"
                    (reactionClicked)="onReactionClicked($event)"
                    (threadClicked)="onThreadClicked($event)"
                  />
                }

                <bk-matrix-message-input
                  [typingUsers]="[]"
                  (messageSent)="onThreadMessageSent($event)"
                  (fileSent)="onThreadFileSent($event)"
                  (typing)="onTyping($event)"
                />
            </div>
          </div>
        </ion-card-content>
        <!-- Video call overlay -->
        @if (isInCall()) {
          <div class="video-call-overlay">
            <video #remoteVideo autoplay playsinline class="remote-video"></video>
            <video #localVideo autoplay playsinline muted class="local-video"></video>

            @if (callState() === 'ringing') {
              <div class="call-status-label">{{'@chat.operation.video.incoming' | translate | async}}</div>
              <div class="call-controls">
                <ion-button class="call-fab" color="success" (click)="answerCall()">
                  <ion-icon slot="icon-only" src="{{'video' | svgIcon}}"></ion-icon>
                </ion-button>
                <ion-button class="call-fab" color="danger" (click)="hangupCall()">
                  <ion-icon slot="icon-only" src="{{'close_cancel' | svgIcon}}"></ion-icon>
                </ion-button>
              </div>
            } @else {
              @if (callState() !== 'connected') {
                <div class="call-status-label">{{ '@chat.operation.video.connecting' | translate | async }}</div>
              }
              <div class="call-controls">
                <ion-button class="call-fab" color="danger" (click)="hangupCall()">
                  <ion-icon slot="icon-only" src="{{'close_cancel' | svgIcon}}"></ion-icon>
                </ion-button>
              </div>
            }
          </div>
        }
      </ion-card>
    } @else {
      <bk-spinner />
    }
  `
})
export class MatrixChat implements OnDestroy {
  private readonly store = inject(MatrixChatStore);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly toastController = inject(ToastController);
  private actionSheetController = inject(ActionSheetController);

  private isInitializing = false; // Guard flag to prevent multiple initializations
  private isRequestingRoomAccess = false;
  private readonly lastRoomAccessAttempt = new Map<string, number>(); // groupId → timestamp of last CF call

  // inputs
  public isGroupView = input<boolean>(false);
  /**
   * If the selectedRoom starts with ! -> matrix room
   * else a personkey was given and a direct chat to this person requested
   */
  public selectedRoom = input<string | undefined>();

  // Computed values from store
  protected readonly syncState = this.store.syncState;
  protected readonly rooms = this.store.rooms;
  protected readonly currentRoom = this.store.currentRoom;
  protected readonly currentRoomId = computed(() => this.store.currentRoomId());
  protected readonly totalUnreadCount = this.store.totalUnreadCount;
  protected readonly matrixUserId = computed(() => this.store.matrixUser()?.id);
  protected readonly homeserverUrl = computed(() => this.store.homeServerUrl());
  private readonly currentUser = computed(() => this.store.currentUser());

  // Local state
  protected readonly replyToMessage = computed(() => this.store.replyToMessage());
  protected showRoomList = signal(!this.isGroupView());

  // Messages signal
  protected readonly messages = computed(() => this.store.messages());
  protected readonly isMessagesLoading = computed(() => this.store.isMessagesLoading());
  protected readonly typingUsers = computed(() => this.store.typingUsers());

  // Thread signals
  protected readonly selectedThreadId = computed(() => this.store.selectedThreadId());
  protected readonly threadMessages = computed(() => this.store.threadMessages());
  protected readonly threadRootMessage = computed(() => this.store.threadRootMessage());
  protected readonly threadReplyCounts = computed(() => this.store.threadReplyCounts());

  // Ready state: true once the Matrix client exists; sync status shown via the banner
  protected readonly isMatrixReady = computed(() =>
    this.store.matrixUser() &&
    this.store.isMatrixInitialized()
  );

  // ─── video call ────────────────────────────────────────────────────────────
  protected readonly isInCall = computed(() => this.store.isInCall());
  protected readonly callState = computed(() => this.store.callState());
  private readonly callFeeds = computed(() => this.store.callFeeds());

  private readonly remoteVideoRef = viewChild<ElementRef>('remoteVideo');
  private readonly localVideoRef = viewChild<ElementRef>('localVideo');

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    // Reactively initialize Matrix when matrixUser becomes available.
    // This handles the case where currentUser() is not yet loaded from Firestore
    // when ngOnInit fires (common on iOS where Firestore subscriptions resolve slower).
    effect(() => {
      const matrixUser = this.store.matrixUser();
      const isInitialized = this.store.isMatrixInitialized();
      if (matrixUser && !isInitialized && isPlatformBrowser(this.platformId)) {
        untracked(() => this.initializeMatrixIfNeeded());
      }
    });
    effect(() => {
      const url = this.store.imageUrl();
      if (url && this.store.isMatrixInitialized()) {
        this.store.setUserAvatarFromUrl(url).catch(err =>
          console.warn('MatrixChat: Avatar upload failed (non-critical):', err)
        );
      }
    });
    effect(() => {
      const roomAlias = this.selectedRoom();
      if (!roomAlias) return;
      // rooms() is a reactive dep: when rooms load after sync, this re-runs and resolves the alias.
      // Also check the BehaviorSubject's current value synchronously — the rxResource may not have
      // processed the initial BehaviorSubject emission yet (it's async), which would cause a
      // transient "choose a chat room" flash for returning users even when rooms are available.
      const rooms = this.store.rooms();
      const syncRooms = rooms.length > 0 ? rooms : this.store.getRoomsSync();
      const match = syncRooms.find(r => r.roomId === roomAlias)
        ?? syncRooms.find(r => r.name?.toLowerCase() === roomAlias.toLowerCase());
      if (match) {
        this.store.setCurrentRoom(match.roomId);
        return;
      }
      // Room not in joined-rooms list. Request access via Cloud Function.
      // Group views: fire as soon as Matrix is initialized (isMatrixInitialized is a reactive dep
      //   so the effect re-runs the moment initialization completes).
      // Other contexts: wait until sync is PREPARED/SYNCING to avoid premature CF calls.
      // In both cases a 15-second cooldown prevents spam while waiting for the join event.
      // A Matrix room ID (starts with '!') means the room was already created (e.g. a fresh DM).
      // Set it directly — the SDK has it even before the next sync cycle emits it via rooms$.
      // Never send a Matrix room ID through requestGroupRoomAccess (it would create a spurious room).
      if (roomAlias.startsWith('!')) {
        this.store.setCurrentRoom(roomAlias);
        return;
      }
      // Otherwise it's a group alias / person key → request access via CF.
      const isReady = this.isGroupView()
        ? this.store.isMatrixInitialized()
        : ['PREPARED', 'SYNCING'].includes(this.store.syncState());
      const lastAttempt = this.lastRoomAccessAttempt.get(roomAlias) ?? 0;
      if (isReady && !this.isRequestingRoomAccess && (Date.now() - lastAttempt) > 15_000) {
        untracked(() => this.requestRoomAccess(roomAlias));
      }
    });
    effect(() => {
      let isGroupView = this.isGroupView();
      if (isGroupView === undefined) isGroupView = false;
      debugMessage(`MatrixChat.isGroupView = <${isGroupView}>`, this.store.currentUser());
      this.showRoomList.set(isGroupView === false);
    });

    // Attach MediaStreams to <video> elements whenever feeds change
    effect(() => {
      const feeds = this.callFeeds();
      const remoteEl = this.remoteVideoRef()?.nativeElement as HTMLVideoElement | undefined;
      const localEl  = this.localVideoRef()?.nativeElement  as HTMLVideoElement | undefined;
      const localFeed  = feeds.find(f => f.isLocal);
      const remoteFeed = feeds.find(f => !f.isLocal);
      if (localEl  && localFeed?.stream)  localEl.srcObject  = localFeed.stream;
      if (remoteEl && remoteFeed?.stream) remoteEl.srcObject = remoteFeed.stream;
    });
  }

  private async requestRoomAccess(groupId: string): Promise<void> {
    if (this.isRequestingRoomAccess) return;
    this.isRequestingRoomAccess = true;
    this.lastRoomAccessAttempt.set(groupId, Date.now());
    try {
      debugMessage(`MatrixChat: Requesting access to group room for ${groupId}`, this.store.currentUser());
      const result = await this.store.requestGroupRoomAccess(groupId);
      debugMessage(`MatrixChat: Got room access, roomId=${result.roomId}`, this.store.currentUser());
      this.store.setCurrentRoom(result.roomId);
    } catch (error) {
      console.error('MatrixChat: Failed to request room access:', error);
      const msg = error instanceof Error ? error.message : 'Room access failed';
      await showToast(this.toastController, msg);
    } finally {
      this.isRequestingRoomAccess = false;
    }
  }

  private async initializeMatrixIfNeeded() {
    if (this.isInitializing) return;

    // Capture signal values at the start to avoid reactive dependencies during async operations
    const matrixUser = this.store.matrixUser();
    const isInitialized = this.store.isMatrixInitialized();

    if (!matrixUser || isInitialized) return;

    this.isInitializing = true;

    try {
      debugMessage('MatrixChat: Getting Matrix credentials via Cloud Function', this.store.currentUser());

      // Call Cloud Function to get Matrix credentials
      // This works for any Firebase auth method (email, phone, Google, etc.)
      const token = await this.store.getMatrixToken();

      if (!token) {
        throw new Error('Failed to get Matrix credentials');
      }

      // Initialize Matrix client with the credentials
      await this.store.initializeMatrix(matrixUser, token);

      debugMessage('MatrixChat: Matrix initialized successfully', this.store.currentUser());
    } catch (error) {
      console.error('MatrixChat: Failed to initialize Matrix:', error);
      this.store.clearCredentials();
    } finally {
      this.isInitializing = false;
    }
  }

  ngOnDestroy() {
    // Don't disconnect the Matrix service here. MatrixChatService is a root singleton
    // that should stay connected for the app session. Disconnecting on component destroy
    // forces a full re-initialization (up to 30 s on iOS) every time the component is
    // recreated (e.g. switching segments in the group view).
  }

  // Event handlers
  onRoomSelected(roomId: string) {
    this.store.setCurrentRoom(roomId);
    if (isPlatformBrowser(this.platformId) && window.innerWidth < 768) {
      this.showRoomList.set(false);
    }
  }

  async onMessageSent(text: string) {
    try {
      await this.store.sendReply(text);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  async onFileSent(file: File) {
    try {
      await this.store.sendFile(file);
    } catch (error) {
      console.error('Failed to send file:', error);
    }
  }

  async onLocationSent() {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const lat = latitude.toFixed(5);
        const lon = longitude.toFixed(5);
        try {
          await this.store.sendLocation(
            `${lat}° N, ${lon}° E`,
            latitude,
            longitude
          );
        } catch (error) {
          console.error('Failed to send location:', error);
        }
      },
      (err) => console.error('Location error:', err),
      { enableHighAccuracy: true }
    );
  }

  async onTyping(isTyping: boolean) {
    await this.store.sendTyping(isTyping);
  }

  /**
   * When a user clicks a message, an actionsheet is shown with appliable operations.
   * The operations are based on the user's role and whether the message is in a thread.
   * e.g. reply, edit, delete, react, showRaw etc.
   * @param message 
   */
  protected async onMessageClicked(message: MatrixMessage): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, message);
    await this.executeActions(actionSheetOptions, message);
  }

  async onImageClicked(message: MatrixMessage): Promise<void> {
    await downloadToBrowser(message.content.url);
  }

  async onFileClicked(message: MatrixMessage): Promise<void> {
    await downloadToBrowser(message.content.url);
  }

  async onReactionClicked(event: { messageId: string; emoji: string }) {
    try {
      await this.store.sendReaction(event.messageId, event.emoji);
    } catch (error) {
      console.error('Failed to react to message:', error);
    }
  }

  onThreadClicked(eventId: string) {
    this.store.setSelectedThread(eventId);
  }

  onCloseThread() {
    this.store.setSelectedThread(undefined);
  }

  async onThreadMessageSent(text: string) {
    const threadId = this.store.selectedThreadId();
    if (!threadId) return;
    try {
      await this.store.sendMessage(text, threadId);
    } catch (error) {
      console.error('Failed to send thread message:', error);
    }
  }

  async onThreadFileSent(file: File) {
    const threadId = this.store.selectedThreadId();
    if (!threadId) return;
    try {
      await this.store.sendFile(file, threadId);
    } catch (error) {
      console.error('Failed to send thread file:', error);
    }
  }

  // show room info / edit (name, topic, avatar)
  async onRoomInfo() {
    const room = this.currentRoom();
    if (room) await this.store.editRoom(room);
  }

  onCancelReply() {
    this.store.setReplyToMessage(undefined);
  }

  toggleRoomList() {
    this.showRoomList.update(visible => !visible);
  }

  onMessagesColumnClicked() {
    if (this.showRoomList() && this.currentRoom()) {
      this.showRoomList.set(false);
    }
  }

  async onCreateRoom(): Promise<void> {
    await this.store.createRoom();
  }

  async onVideoCallStarted(): Promise<void> {
    try {
      await this.store.startVideoCall();
    } catch (error) {
      console.error('MatrixChat: Failed to start video call:', error);
      await showToast(this.toastController, 'Video-Call fehlgeschlagen');
    }
  }

  hangupCall(): void {
    this.store.hangupCall();
  }

  async answerCall(): Promise<void> {
    await this.store.answerCall();
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param message the Matrix message data
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, message: MatrixMessage): void {
    const currentUserId = this.matrixUserId();
    const isAuthor = !!currentUserId && message.sender === currentUserId;

    if (isAuthor) { // author of message
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.delete', this.imgixBaseUrl, 'trash_delete'));
    } else {  // receiver of message
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.react', this.imgixBaseUrl, 'smiley'));
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.reply', this.imgixBaseUrl, 'return_reply'));
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.thread', this.imgixBaseUrl, 'branch'));
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.report', this.imgixBaseUrl, 'alert-circle'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('chat.message.copy', this.imgixBaseUrl, 'copy'));
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.raw', this.imgixBaseUrl, 'code'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param address 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, message: MatrixMessage): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'chat.message.react':
          await this.store.reactToMessage(message);
          break;
        case 'chat.message.reply':
          this.store.setReplyToMessage(message);
          break;
        case 'chat.message.thread':
          await this.store.replyInThread(message);
          break;
        case 'chat.message.report':
          await this.store.reportMessage(message);
          break;
        case 'chat.message.copy':
          await this.store.copy(message);
          break;
        case 'chat.message.raw':
          await this.store.showRawMessage(message);
          break;
        case 'chat.message.edit':
          await this.store.editMessage(message);
          break;
        case 'chat.message.delete':
          await this.store.deleteMessage(message);
          break;
      }
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
