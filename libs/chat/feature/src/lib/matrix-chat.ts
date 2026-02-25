import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, effect, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { IonCard, IonCardContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonBadge } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { SpinnerComponent } from '@bk2/shared-ui';

import { MatrixMessageInput, MatrixMessageList, MatrixRoomList } from '@bk2/chat-ui';

import { MatrixChatStore } from './matrix-chat.store';

@Component({
  selector: 'bk-matrix-chat-overview',
  standalone: true,
  imports: [
    SpinnerComponent,
    IonCard, IonCardContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonBadge,
    MatrixRoomList, MatrixMessageList, MatrixMessageInput,
    SvgIconPipe,
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
                <ion-badge color="warning">Reconnecting...</ion-badge>
              }
              @case ('ERROR') { 
                <ion-badge color="danger">Connection error</ion-badge>
              }
              @default { 
                <ion-badge color="medium">Connecting...</ion-badge>
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
                      <ion-button (click)="toggleMobileRoomList()">
                        <ion-icon src="{{'menu' | svgIcon}}"></ion-icon>
                      </ion-button>
                    </ion-buttons> 
                    <ion-title>Chat-Räume</ion-title>
                    <ion-buttons slot="end">
                      <ion-button (click)="onCreateRoom()">
                        <ion-icon src="{{'add-circle' | svgIcon}}"></ion-icon>
                      </ion-button>
                    </ion-buttons>
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
                        <ion-button (click)="toggleMobileRoomList()">
                          <ion-icon src="{{'menu' | svgIcon}}"></ion-icon>
                        </ion-button>
                      </ion-buttons>
                    }
                    
                    <ion-title>{{ currentRoom()?.name }}</ion-title>
                    
                    <ion-buttons slot="end">
                      <ion-button (click)="onRoomInfo()">
                        <ion-icon src="{{'info-circle' | svgIcon}}"></ion-icon>
                      </ion-button>
                    </ion-buttons>
                  </ion-toolbar>
                </ion-header>

                <!-- Message List -->
                <bk-matrix-message-list
                  [messages]="messages()"
                  [currentUserId]="matrixUserId()"
                  [homeserverUrl]="homeserverUrl()"
                  (messageClicked)="onMessageClicked($event)"
                  (messageContextMenu)="onMessageContextMenu($event)"
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
                    <h3>Select a room to start chatting</h3>
                    @if (rooms().length === 0) {
                      <p>No rooms available. Create or join a room to get started.</p>
                      <ion-button (click)="onCreateRoom()">Create Test Room</ion-button>
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
export class MatrixChat implements OnInit, OnDestroy {
  private readonly store = inject(MatrixChatStore);
  private readonly platformId = inject(PLATFORM_ID);

  private isInitializing = false; // Guard flag to prevent multiple initializations

  // inputs
  public isGroupView = input<boolean>(false);
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

  // Ready state
  protected readonly isMatrixReady = computed(() => 
    this.store.matrixUser() && 
    this.store.isMatrixInitialized() &&
    this.syncState() !== 'STOPPED'
  );

  constructor() {
    effect(() => {
      const url = this.store.imageUrl();
      if (url && this.store.isMatrixInitialized()) {
        this.store.setUserAvatarFromUrl(url);
      }
    });
    effect(() => {
      const roomAlias = this.selectedRoom();
      if (!roomAlias) return;
      // rooms() is a reactive dep: when rooms load after sync, this re-runs and resolves the alias
      const rooms = this.store.rooms();
      const match = rooms.find(r => r.roomId === roomAlias)
        ?? rooms.find(r => r.name?.toLowerCase() === roomAlias.toLowerCase());
      this.store.setCurrentRoom(match ? match.roomId : roomAlias);
    });
    effect(() => {
      let isGroupView = this.isGroupView();
      if (isGroupView === undefined) isGroupView = false;
      console.log('MatrixChat.isGroupView = <' + isGroupView + '>');
      this.showRoomList.update(visible => (isGroupView === false));
    });
  }

  async ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    
    // Wait for Angular to stabilize before initializing Matrix
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Use queueMicrotask to ensure this runs outside of change detection
    queueMicrotask(() => {
      this.initializeMatrixIfNeeded();
    });
  }

  private async initializeMatrixIfNeeded() {
    if (this.isInitializing) return;
    
    // Capture signal values at the start to avoid reactive dependencies during async operations
    const matrixUser = this.store.matrixUser();
    const isInitialized = this.store.isMatrixInitialized();
    
    if (!matrixUser || isInitialized) return;

    this.isInitializing = true;

    try {
      console.log('MatrixChat: Getting Matrix credentials via Cloud Function');
      
      // Call Cloud Function to get Matrix credentials
      // This works for any Firebase auth method (email, phone, Google, etc.)
      const token = await this.store.getMatrixToken();
      
      if (!token) {
        throw new Error('Failed to get Matrix credentials');
      }

      // Initialize Matrix client with the credentials
      await this.store.initializeMatrix(matrixUser, token);
      
      console.log('MatrixChat: Matrix initialized successfully');
    } catch (error) {
      console.error('MatrixChat: Failed to initialize Matrix:', error);
      this.store.clearCredentials();
    } finally {
      this.isInitializing = false;
    }
  }

  ngOnDestroy() {
    this.store.cleanup();
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
            `Current location: ${latitude},${longitude}`,
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

  onMessageContextMenu(message: any) {
    // Handle message long press / right click
    console.log('Message context menu:', message);
    // TBD: Show action sheet with options (reply, edit, delete, react, etc.)
  }

  onImageClicked(message: any) {
    // Handle image click (e.g., open fullscreen)
    console.log('Image clicked:', message);
    // TBD: Open image viewer
  }

  onFileClicked(message: any) {
    // Handle file click (e.g., download)
    console.log('File clicked:', message);
    // TBD: Download file
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

  // show room info (e.g., members, settings)
  onRoomInfo() {

    // Show room information
    console.log('Room info clicked');
    // TBD: Show room info modal
  }

  onCancelReply() {
    // Cancel reply
    // TBD: Clear reply state
  }

  toggleMobileRoomList() {
    this.showRoomList.update(visible => !visible);
  }

  async onCreateRoom(): Promise<void> {
    await this.store.createRoom();
  }
}
