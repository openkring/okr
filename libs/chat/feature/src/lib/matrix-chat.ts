import { Component, ElementRef, PLATFORM_ID, computed, effect, inject, input, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonCard, IonCardContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonBadge, ActionSheetOptions, ActionSheetController, ModalController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { ImageLightboxModal, LightboxImage, Spinner } from '@bk2/shared-ui';
import { debugMessage, hasRole } from '@bk2/shared-util-core';
import { AlertService, createActionSheetButton, createActionSheetOptions, downloadFile, isBrowser } from '@bk2/shared-util-angular';
import { MatrixMessage, RoleName } from '@bk2/shared-models';

import { MatrixMessageInput, MatrixMessageList, MatrixRoomList } from '@bk2/chat-ui';
import { MatrixPollData } from '@bk2/chat-data-access';
import { convertHeicToJpeg, isSupportedImageFile } from '@bk2/chat-util';

import { MatrixChatStore } from './matrix-chat.store';
import { PollCreateModal } from './poll-create.modal';

@Component({
  selector: 'bk-matrix-chat-overview',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, MatrixRoomList, MatrixMessageList, MatrixMessageInput,
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

    .messages-column {
      position: relative;
    }

    .thread-panel {
      position: relative;
    }

    .drop-overlay {
      position: absolute;
      inset: 0;
      background: rgba(var(--ion-color-primary-rgb, 56, 128, 255), 0.12);
      border: 2px dashed var(--ion-color-primary, #3880ff);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      z-index: 20;
      pointer-events: none;
      color: var(--ion-color-primary, #3880ff);
      font-size: 1rem;
      font-weight: 600;
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
                <ion-badge color="warning">{{ store.i18n.reconnecting() }}</ion-badge>
              }
              @case ('ERROR') { 
                <ion-badge color="danger">{{ store.i18n.connectionError() }}</ion-badge>
              }
              @default { 
                <ion-badge color="medium">{{ store.i18n.connecting() }}</ion-badge>
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
                  <ion-title>{{ store.i18n.rooms() }}</ion-title>
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
                [i18n]="store.i18n"
                (roomSelected)="onRoomSelected($event)"
              />
            </div>

            <!-- Messages Area -->
            <div class="messages-column"
              (click)="onMessagesColumnClicked()"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event)"
            >
              @if(isDragOver()) {
                <div class="drop-overlay">
                  <ion-icon src="{{'upload' | svgIcon}}"></ion-icon>
                  <span>Dateien hierher ziehen</span>
                </div>
              }
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
                    [receiptsByEventId]="receiptsByEventId()"
                    [i18n]="store.i18n"
                    (messageClicked)="onMessageClicked($event)"
                    (imageClicked)="onImageClicked($event)"
                    (fileClicked)="onFileClicked($event)"
                    (reactionClicked)="onReactionClicked($event)"
                    (threadClicked)="onThreadClicked($event)"
                    (pollVoteClicked)="onPollVoteClicked($event)"
                    (pollEndClicked)="onPollEndClicked($event)"
                  />
                }

                <!-- Message Input -->
                <bk-matrix-message-input
                  [i18n]="store.i18n"
                  [roomId]="currentRoomId()"
                  [typingUsers]="typingUsers()"
                  [replyToMessage]="replyToMessage()"
                  [pendingImages]="pendingImages()"
                  (messageSent)="onMessageSent($event)"
                  (fileSent)="onFileSent($event)"
                  (fileQueued)="onFileQueued($event)"
                  (removeImage)="onRemoveImage($event)"
                  (filesSent)="onFilesSent($event)"
                  (locationSent)="onLocationSent()"
                  (surveyRequested)="onSurveyRequested()"
                  (videoCallStarted)="onVideoCallStarted()"
                  (typing)="onTyping($event)"
                  (cancelReplyClicked)="onCancelReply()"
                />
              } @else {
                <div class="empty-state">
                  <ion-icon src="{{'chatbubbles' | svgIcon}}" size="large"></ion-icon>
                  <div>
                    <h3>{{ store.i18n.selectRoom() }}</h3>
                    @if (rooms().length === 0) {
                      <p>{{ store.i18n.noRoomsError() }}</p>
                      <ion-button (click)="onCreateRoom()">{{ store.i18n.createTestRoom() }}</ion-button>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- Thread Panel (always in DOM; CSS width animates it in/out) -->
            <div class="thread-panel"
              [class.collapsed]="!selectedThreadId()"
              (dragover)="onThreadDragOver($event)"
              (dragleave)="onThreadDragLeave($event)"
              (drop)="onThreadDrop($event)"
            >
              @if(isThreadDragOver()) {
                <div class="drop-overlay">
                  <ion-icon src="{{'upload' | svgIcon}}"></ion-icon>
                  <span>Dateien hierher ziehen</span>
                </div>
              }
                <ion-header class="room-header">
                  <ion-toolbar>
                    <ion-title>Thread</ion-title>
                    <ion-buttons slot="end">
                      <ion-button (click)="onCloseThread()">
                        <ion-icon src="{{'cancel' | svgIcon}}"></ion-icon>
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
                  <div class="thread-empty">{{ store.i18n.thread_empty() }}</div>
                } @else {
                  <bk-matrix-message-list
                    [messages]="threadMessages()"
                    [currentUserId]="matrixUserId()"
                    [homeserverUrl]="homeserverUrl()"
                    [typingUsers]="[]"
                    [i18n]="store.i18n"
                    (messageClicked)="onMessageClicked($event)"
                    (imageClicked)="onImageClicked($event)"
                    (fileClicked)="onFileClicked($event)"
                    (reactionClicked)="onReactionClicked($event)"
                    (threadClicked)="onThreadClicked($event)"
                    (pollVoteClicked)="onPollVoteClicked($event)"
                    (pollEndClicked)="onPollEndClicked($event)"
                  />
                }

                <bk-matrix-message-input
                  [i18n]="store.i18n"
                  [typingUsers]="[]"
                  (messageSent)="onThreadMessageSent($event)"
                  (fileSent)="onThreadFileSent($event)"
                  (fileQueued)="onThreadFileQueued($event)"
                  (typing)="onTyping($event)"
                  (surveyRequested)="onSurveyRequested()"
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
              <div class="call-status-label">{{ store.i18n.video_incoming() }}</div>
              <div class="call-controls">
                <ion-button class="call-fab" color="success" (click)="answerCall()">
                  <ion-icon slot="icon-only" src="{{'video' | svgIcon}}"></ion-icon>
                </ion-button>
                <ion-button class="call-fab" color="danger" (click)="hangupCall()">
                  <ion-icon slot="icon-only" src="{{'cancel' | svgIcon}}"></ion-icon>
                </ion-button>
              </div>
            } @else {
              @if (callState() !== 'connected') {
                <div class="call-status-label">{{ store.i18n.video_connecting() }}</div>
              }
              <div class="call-controls">
                <ion-button class="call-fab" color="danger" (click)="hangupCall()">
                  <ion-icon slot="icon-only" src="{{'cancel' | svgIcon}}"></ion-icon>
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
  protected readonly store = inject(MatrixChatStore);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly alertService = inject(AlertService);
  private actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);

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
  protected isDragOver = signal(false);
  protected isThreadDragOver = signal(false);
  protected pendingImages = signal<File[]>([]);

  // Messages signal
  protected readonly messages = computed(() => this.store.messages());
  protected readonly isMessagesLoading = computed(() => this.store.isMessagesLoading());
  protected readonly typingUsers = computed(() => this.store.typingUsers());
  protected readonly receiptsByEventId = computed(() => this.store.receiptsByEventId());

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
      if (matrixUser && !isInitialized && isBrowser(this.platformId)) {
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

    // Auto-mark the current room as read whenever it still has unread messages while being viewed.
    // This handles the sync-delay case: setCurrentRoom() calls markRoomAsRead() but the Matrix
    // client may not have the room yet (join via CF, room arrives in the next sync cycle).
    // When rooms() updates and the current room appears with unreadCount > 0, this re-sends
    // the receipt so the badge resets without requiring the user to re-select the room.
    effect(() => {
      const room = this.store.currentRoom();
      if (!room || room.unreadCount === 0) return;
      untracked(() => this.store.markCurrentRoomAsRead());
    });

    // Re-authenticate when the Matrix access token expires (M_UNKNOWN_TOKEN).
    // Fast path: component is mounted when STOPPED fires.
    this.store.matrixService.tokenExpired
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        console.warn('MatrixChat: Token expired — reconnecting');
        this.store.cleanup().then(() => this.initializeMatrixIfNeeded());
      });

    // When the user taps the chat menu item while already on the chat page,
    // toggle the room list so they can switch to another room.
    this.store.matrixService.roomListToggle
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.showRoomList.update(v => !v));

    // Slow path: component mounts AFTER the token expired (user was on another page).
    // The service clears stored credentials on M_UNKNOWN_TOKEN. If the client is
    // stopped, the store still thinks we're initialized, but credentials are gone.
    effect(() => {
      const syncState = this.store.syncState();
      const isInitialized = this.store.isMatrixInitialized();
      if (syncState === 'STOPPED' && isInitialized && !this.store.matrixService.getStoredCredentials()) {
        console.warn('MatrixChat: Token expired while unmounted — triggering re-auth');
        untracked(() => this.store.cleanup().then(() => this.initializeMatrixIfNeeded()));
      }
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
      await this.alertService.showToast(msg);
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
      debugMessage('MatrixChat: Ensuring Matrix is initialized', this.store.currentUser());

      // ARCH-1: single idempotent, promise-cached path (fetch credentials via CF +
      // start client). Shared with the early-init service so the two never race to
      // mint two tokens. Works for any Firebase auth method (email, phone, Google, …).
      await this.store.ensureInitialized();

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
    if (isBrowser(this.platformId) && window.innerWidth < 768) {
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

  async onSurveyRequested(): Promise<void> {
    const modal = await this.modalController.create({ component: PollCreateModal });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<MatrixPollData>();
    if (role === 'confirm' && data) {
      try {
        await this.store.sendPoll(data);
      } catch (error) {
        console.error('MatrixChat: Failed to send poll:', error);
      }
    }
  }

  protected async onPollVoteClicked(e: { pollEventId: string; answerIds: string[] }): Promise<void> {
    try {
      await this.store.sendPollResponse(e.pollEventId, e.answerIds);
    } catch (error) {
      console.error('MatrixChat: Failed to send poll response:', error);
    }
  }

  protected async onPollEndClicked(e: { pollEventId: string }): Promise<void> {
    try {
      await this.store.endPoll(e.pollEventId);
    } catch (error) {
      console.error('MatrixChat: Failed to end poll:', error);
    }
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

  protected async onImageClicked(event: { message: MatrixMessage; group: MatrixMessage[] }): Promise<void> {
    const images: LightboxImage[] = event.group.map(m => ({
      mediaUrl: m.mediaUrl ?? (m.content?.url as string | undefined) ?? '',
      filename: m.body,
    }));
    const initialIndex = event.group.indexOf(event.message);
    const modal = await this.modalController.create({
      component: ImageLightboxModal,
      componentProps: { images, initialIndex },
      cssClass: 'fullscreen-modal',
    });
    await modal.present();
  }

  async onFileClicked(message: MatrixMessage): Promise<void> {
    // message.content.url is an mxc:// URI that the browser cannot resolve, and Synapse
    // authenticated media needs a bearer header anyway. message.mediaUrl is the already
    // authenticated blob URL produced by MatrixChatService.resolveMediaUrl — download that.
    const url = message.mediaUrl ?? message.content.url;
    if (!url || url.startsWith('mxc://')) {
      await this.alertService.showToast('Datei nicht verfügbar');
      return;
    }
    try {
      await downloadFile(url, message.body);
    } catch (error) {
      console.error('Failed to download chat attachment:', error);
      await this.alertService.showToast('Datei konnte nicht heruntergeladen werden');
    }
  }

  protected async onFileQueued(file: File): Promise<void> {
    const normalized = await convertHeicToJpeg(file);
    this.pendingImages.update(prev => [...prev, normalized]);
  }

  protected onRemoveImage(index: number): void {
    this.pendingImages.update(prev => prev.filter((_, i) => i !== index));
  }

  protected async onFilesSent(files: File[]): Promise<void> {
    this.pendingImages.set([]);
    const results = await Promise.allSettled(files.map(f => this.store.sendFile(f)));
    const failures = results.filter(r => r.status === 'rejected').length;
    if (failures > 0) {
      await this.alertService.showToast(`${failures} Bild(er) konnten nicht gesendet werden`);
    }
  }

  protected async onThreadFileQueued(file: File): Promise<void> {
    const threadId = this.store.selectedThreadId();
    if (!threadId) return;
    try {
      await this.store.sendFile(file, threadId);
    } catch (error) {
      console.error('Failed to send thread image:', error);
    }
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

  protected onDragOver(event: DragEvent): void {
    if (!this.currentRoomId()) return;
    event.preventDefault();
    this.isDragOver.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    const host = event.currentTarget as HTMLElement;
    if (!host.contains(event.relatedTarget as Node | null)) {
      this.isDragOver.set(false);
    }
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isDragOver.set(false);
    if (!this.currentRoomId()) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) return;

    const imageFiles = files.filter(f => isSupportedImageFile(f));
    const otherFiles = files.filter(f => !isSupportedImageFile(f));

    if (imageFiles.length > 0) {
      const normalized = await Promise.all(imageFiles.map(f => convertHeicToJpeg(f)));
      this.pendingImages.update(prev => [...prev, ...normalized]);
    }

    if (otherFiles.length > 0) {
      const results = await Promise.allSettled(otherFiles.map(f => this.store.sendFile(f)));
      const failures = results.filter(r => r.status === 'rejected').length;
      if (failures > 0) {
        await this.alertService.showToast(`${failures} Datei(en) konnten nicht gesendet werden`);
      }
    }
  }

  protected onThreadDragOver(event: DragEvent): void {
    if (!this.selectedThreadId()) return;
    event.preventDefault();
    this.isThreadDragOver.set(true);
  }

  protected onThreadDragLeave(event: DragEvent): void {
    const host = event.currentTarget as HTMLElement;
    if (!host.contains(event.relatedTarget as Node | null)) {
      this.isThreadDragOver.set(false);
    }
  }

  protected async onThreadDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isThreadDragOver.set(false);
    const threadId = this.selectedThreadId();
    if (!threadId) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) return;
    const results = await Promise.allSettled(files.map(f => this.store.sendFile(f, threadId)));
    const failures = results.filter(r => r.status === 'rejected').length;
    if (failures > 0) {
      await this.alertService.showToast(`${failures} Datei(en) konnten nicht gesendet werden`);
    }
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
      await this.alertService.showToast('Video-Call fehlgeschlagen');
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
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.edit', this.store.i18n.msg_edit(), this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.delete', this.store.i18n.msg_delete(), this.imgixBaseUrl, 'trash'));
    } else {  // receiver of message
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.react', this.store.i18n.msg_react_header(), this.imgixBaseUrl, 'smiley'));
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.reply', this.store.i18n.msg_reply(), this.imgixBaseUrl, 'return_reply'));
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.thread', this.store.i18n.thread_open(), this.imgixBaseUrl, 'branch'));
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.report', this.store.i18n.msg_report_header(), this.imgixBaseUrl, 'alert-circle'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('chat.message.copy', this.store.i18n.msg_copy(), this.imgixBaseUrl, 'copy'));
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('chat.message.raw', this.store.i18n.msg_raw(), this.imgixBaseUrl, 'code'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
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
