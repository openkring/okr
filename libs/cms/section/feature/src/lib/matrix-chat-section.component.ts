import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, effect, inject, input, OnDestroy, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonCard, IonCardContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { menuOutline, informationCircleOutline, chatbubblesOutline } from 'ionicons/icons';

import { ChatSection } from '@bk2/shared-models';
import { SpinnerComponent, OptionalCardHeaderComponent } from '@bk2/shared-ui';

import { MatrixRoomListComponent, MatrixMessageListComponent, MatrixMessageInputComponent } from '@bk2/cms-section-ui';

import { MatrixChatSectionStore } from './matrix-chat-section.store';

@Component({
  selector: 'bk-matrix-chat-section',
  standalone: true,
  imports: [
    SpinnerComponent, OptionalCardHeaderComponent,
    IonCard, IonCardContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    MatrixRoomListComponent, MatrixMessageListComponent, MatrixMessageInputComponent,
  ],
  providers: [MatrixChatSectionStore],
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

    @media (max-width: 768px) {
      .room-list-column {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 100%;
        z-index: 10;
        background: var(--ion-background-color);
        transform: translateX(-100%);
        transition: transform 0.3s;
      }

      .room-list-column.show {
        transform: translateX(0);
      }
    }
  `],
  template: `
    @if (isMatrixReady()) {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        
        <!-- Sync status indicator -->
        @if (syncState() !== 'PREPARED') {
          <div class="sync-status">
            @switch (syncState()) {
              @case ('SYNCING') { Syncing messages... }
              @case ('RECONNECTING') { Reconnecting... }
              @case ('ERROR') { Connection error }
              @default { Connecting... }
            }
          </div>
        }

        <ion-card-content class="ion-no-padding">
          <div class="chat-container">
            <!-- Room List -->
            @if (showRoomList()) {
              <div class="room-list-column" [class.show]="mobileRoomListVisible()">
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
                    @if (showRoomList()) {
                      <ion-buttons slot="start">
                        <ion-button (click)="toggleMobileRoomList()">
                          <ion-icon name="menu-outline"></ion-icon>
                        </ion-button>
                      </ion-buttons>
                    }
                    
                    <ion-title>{{ currentRoom()?.name }}</ion-title>
                    
                    <ion-buttons slot="end">
                      <ion-button (click)="onRoomInfo()">
                        <ion-icon name="information-circle-outline"></ion-icon>
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
                  <ion-icon name="chatbubbles-outline" size="large"></ion-icon>
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
export class MatrixChatSectionComponent implements OnInit, OnDestroy {
  private readonly store = inject(MatrixChatSectionStore);
  private readonly platformId = inject(PLATFORM_ID);
  private isInitializing = false; // Guard flag to prevent multiple initializations

  // Inputs
  public section = input<ChatSection>();

  // Computed values from store
  protected readonly syncState = this.store.matrixSyncState;
  protected readonly rooms = this.store.matrixRooms;
  protected readonly currentRoom = this.store.currentRoom;
  protected readonly currentRoomId = computed(() => this.store.currentRoomId());
  protected readonly totalUnreadCount = this.store.totalUnreadCount;
  protected readonly matrixUserId = computed(() => this.store.matrixUser()?.id);
  
  // Local state
  protected readonly mobileRoomListVisible = computed(() => false); // TODO: make this stateful
  protected readonly replyToMessage = computed(() => undefined); // TODO: implement reply
  
  // Messages signal
  protected readonly messages = toSignal(this.store.getMessages(), { initialValue: [] });
  protected readonly typingUsers = computed(() => this.currentRoom()?.typingUsers || []);

  // Derived from section input
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly showRoomList = computed(() => this.section()?.properties.showChannelList ?? true);
  protected readonly homeserverUrl = computed(() => 'https://matrix.bkchat.etke.host'); // TODO: get from env

  // Ready state
  protected readonly isMatrixReady = computed(() => 
    this.store.matrixUser() && 
    this.store.isMatrixInitialized() &&
    this.syncState() !== 'STOPPED'
  );

  constructor() {
    // Register icons
    addIcons({ menuOutline, informationCircleOutline, chatbubblesOutline });
    
    // Set up config when section changes
    effect(() => {
      const section = this.section();
      if (section) {
        this.store.setConfig(section.properties);
        this.store.setShowRoomList(section.properties.showChannelList ?? true);
      }
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
      // Check if we returned from OIDC redirect and need to exchange the login token
      const needsTokenExchange = sessionStorage.getItem('matrix_needs_token_exchange');
      const loginToken = localStorage.getItem('matrix_login_token');

      if (needsTokenExchange === 'true' && loginToken) {
        console.log('MatrixChatSectionComponent: Handling OIDC callback');
        
        // Exchange login token for access token
        const token = await this.store.handleMatrixOidcCallback(loginToken);
        
        // Clean up
        sessionStorage.removeItem('matrix_needs_token_exchange');
        localStorage.removeItem('matrix_login_token');
        
        // Initialize with the token
        await this.store.initializeMatrix(matrixUser, token);
        return;
      }

      // Try to get existing token or initiate OIDC flow
      const token = await this.store.getMatrixToken();
      
      if (token) {
        // We have a valid token, initialize Matrix
        await this.store.initializeMatrix(matrixUser, token);
      } else {
        // No token available, need to initiate OIDC login
        console.log('MatrixChatSectionComponent: No Matrix token, initiating OIDC login');
        
        // Store current URL to return to after authentication
        sessionStorage.setItem('matrix_return_url', window.location.pathname);
        
        // This will redirect to Matrix SSO
        await this.store.initiateMatrixOidcLogin();
      }
    } catch (error) {
      console.error('MatrixChatSectionComponent: Failed to initialize Matrix:', error);
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
  }

  onMessageContextMenu(message: any) {
    // Handle message long press / right click
    console.log('Message context menu:', message);
    // TODO: Show action sheet with options (reply, edit, delete, react, etc.)
  }

  onImageClicked(message: any) {
    // Handle image click (e.g., open fullscreen)
    console.log('Image clicked:', message);
    // TODO: Open image viewer
  }

  onFileClicked(message: any) {
    // Handle file click (e.g., download)
    console.log('File clicked:', message);
    // TODO: Download file
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
    // TODO: Show thread view
  }

  onRoomInfo() {
    // Show room information
    console.log('Room info clicked');
    // TODO: Show room info modal
  }

  onCancelReply() {
    // Cancel reply
    // TODO: Clear reply state
  }

  toggleMobileRoomList() {
    // TODO: Toggle mobile room list visibility
  }

  async onCreateRoom() {
    try {
      const roomName = prompt('Enter room name:', 'General Chat');
      if (!roomName) return;

      console.log('Creating room:', roomName);
      const roomId = await this.store.createGroupRoom(roomName, [], 'Welcome to ' + roomName);
      console.log('Room created successfully:', roomId);
    } catch (error) {
      console.error('Failed to create room:', error);
      alert('Failed to create room. Check console for details.');
    }
  }
}
