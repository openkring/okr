import { AsyncPipe, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { IonCard, IonCardContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonBadge, ToastController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { SpinnerComponent } from '@bk2/shared-ui';

import { MatrixMessageInput, MatrixMessageList, MatrixRoomList } from '@bk2/chat-ui';

import { MatrixChatStore } from './matrix-chat.store';
import { TranslatePipe } from '@bk2/shared-i18n';
import { debugMessage, hasRole } from '@bk2/shared-util-core';
import { downloadToBrowser, showToast } from '@bk2/shared-util-angular';
import { RoleName } from '@bk2/shared-models';

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
    }

    ion-card-content { 
      padding: 0px; 
      height: 100%;
    }
    
    ion-card { 
      padding: 0px; 
      margin: 0px; 
      border: 0px; 
      box-shadow: none !important;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .chat-container {
      display: flex;
      height: 100%;
      overflow: hidden;
    }

    .room-list-column {
      border-right: 1px solid var(--ion-border-color, #dedede);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .messages-column {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex: 1;
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
  `],
  template: `
    @if (isMatrixReady()) {
      <ion-card>        
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
            <!-- Room List -->
            @if (showRoomList()) {
              <div class="room-list-column">
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
            }

            <!-- Messages Area -->
            <div class="messages-column">
              @if (currentRoom()) {
                <!-- Room Header -->
                <ion-header class="room-header">
                  <ion-toolbar>
                    @if (!showRoomList() && !isGroupView()) {
                      <ion-buttons slot="start">
                        <ion-button (click)="toggleRoomList()">
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

                <!-- Message List -->
                <bk-matrix-message-list
                  [messages]="messages()"
                  [currentUserId]="matrixUserId()"
                  [homeserverUrl]="homeserverUrl()"
                  (messageClicked)="onMessageClicked($event)"
                  (imageClicked)="onImageClicked($event)"
                  (fileClicked)="onFileClicked($event)"
                  (reactionClicked)="onReactionClicked($event)"
                  (threadClicked)="onThreadClicked($event)"
                />

                <!-- Message Input -->
                <bk-matrix-message-input
                  [typingUsers]="typingUsers()"
                  [replyToMessage]="replyToMessage()"
                  (messageSent)="onMessageSent($event)"
                  (fileSent)="onFileSent($event)"
                  (locationSent)="onLocationSent()"
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
          </div>
        </ion-card-content>
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

  // Local state
  protected readonly replyToMessage = computed(() => undefined); // tbd: implement reply
  protected showRoomList = signal(!this.isGroupView());

  // Messages signal
  protected readonly messages = computed(() => this.store.messages());
  protected readonly typingUsers = computed(() => this.currentRoom()?.typingUsers || []);

  // Ready state: true once the Matrix client exists; sync status shown via the banner
  protected readonly isMatrixReady = computed(() =>
    this.store.matrixUser() &&
    this.store.isMatrixInitialized()
  );

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
      // rooms() is a reactive dep: when rooms load after sync, this re-runs and resolves the alias
      const rooms = this.store.rooms();
      const match = rooms.find(r => r.roomId === roomAlias)
        ?? rooms.find(r => r.name?.toLowerCase() === roomAlias.toLowerCase());
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
  }

  async onMessageSent(text: string) {
    try {
      await this.store.sendMessage(text);
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
        try {
          await this.store.sendLocation(
            `Aktuelle Position: ${latitude},${longitude}`,
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

  onMessageClicked(message: any) {
    // Handle message click (e.g., show options)
    console.log('Message clicked:', message);
    // TBD: Show action sheet with options (reply, edit, delete, react, etc.)
  }

  async onImageClicked(message: any): Promise<void> {
    await downloadToBrowser(message.content.url);
  }

  async onFileClicked(message: any): Promise<void> {
    await downloadToBrowser(message.content.url);
  }

  async onReactionClicked(event: { messageId: string; emoji: string }) {
    try {
      await this.store.reactToMessage(event.messageId, event.emoji);
    } catch (error) {
      console.error('Failed to react to message:', error);
    }
  }

  onThreadClicked(eventId: string) {
    // Handle thread click
    console.log('Thread clicked:', eventId);
    this.store.setSelectedThread(eventId);
    // TBD: Show thread view
  }

  // show room info / edit (name, topic, avatar)
  async onRoomInfo() {
    const room = this.currentRoom();
    if (room) await this.store.editRoom(room);
  }

  onCancelReply() {
    // Cancel reply
    // TBD: Clear reply state
  }

  toggleRoomList() {
    this.showRoomList.update(visible => !visible);
  }

  async onCreateRoom(): Promise<void> {
    await this.store.createRoom();
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
