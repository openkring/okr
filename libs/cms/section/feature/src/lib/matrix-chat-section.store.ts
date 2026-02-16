import { computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { catchError, from, map, Observable, of, switchMap } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { ChatConfig, DefaultLanguage } from '@bk2/shared-models';
import { debugData, debugItemLoaded, debugMessage, die } from '@bk2/shared-util-core';
import { AvatarService } from '@bk2/avatar-data-access';

import { 
  MatrixChatService, 
  MatrixConfig, 
  MatrixRoom, 
  MatrixMessage 
} from '@bk2/cms-section-data-access';

export interface MatrixUser {
  id: string; // Matrix user ID (@user:homeserver)
  name: string;
  imageUrl: string;
}

export interface MatrixAuthToken {
  accessToken: string;
  userId: string;
  deviceId: string;
  homeserverUrl: string;
}

export interface MatrixChatSectionState {
  config: ChatConfig | undefined;
  isMatrixInitialized: boolean;
  currentRoomId: string | undefined;
  showRoomList: boolean;
  selectedThreadId: string | undefined;
}

export const initialState: MatrixChatSectionState = {
  config: undefined,
  isMatrixInitialized: false,
  currentRoomId: undefined,
  showRoomList: true,
  selectedThreadId: undefined,
};

export const MatrixChatSectionStore = signalStore(
  withState(initialState),
  
  withComputed(() => {
    const appStore = inject(AppStore);
    const avatarService = inject(AvatarService);
    const matrixService = inject(MatrixChatService);

    return {
      currentUser: computed(() => appStore.currentUser()),
      imgixBaseUrl: computed(() => appStore.services.imgixBaseUrl()),
      matrixSyncState: toSignal(matrixService.syncState, { initialValue: 'STOPPED' }),
      matrixRooms: toSignal(matrixService.rooms, { initialValue: [] }),
    };
  }),

  withComputed((state) => {
    const avatarService = inject(AvatarService);
    
    return {
      imageUrl: computed(() => {
        const user = state.currentUser();
        if (!user) return undefined;
        return avatarService.getAvatarUrl(`person.${user.personKey}`, 'person');
      }),
    };
  }),

  withComputed((state) => {
    const appStore = inject(AppStore);

    return {
      matrixUser: computed((): MatrixUser | undefined => {
        const user = state.currentUser();
        const url = state.imageUrl();
        if (!user || !url) return undefined;
        
        // Convert Firebase user to Matrix format
        // Matrix user IDs follow format: @localpart:homeserver
        let homeServerUrl = appStore.env.services.matrixHomeserver || 'matrix.bkchat.etke.host';
        if (!homeServerUrl.startsWith('https://')) homeServerUrl = 'https://' + homeServerUrl;
        const matrixUserId = `@${user.bkey}:${homeServerUrl}`;
        
        return {
          id: matrixUserId,
          name: user.firstName,
          imageUrl: url,
        };
      }),

      currentRoom: computed(() => {
        const roomId = state.currentRoomId();
        if (!roomId) return undefined;
        return state.matrixRooms().find(r => r.roomId === roomId);
      }),

      unreadRooms: computed(() => {
        return state.matrixRooms().filter(r => r.unreadCount > 0);
      }),

      totalUnreadCount: computed(() => {
        return state.matrixRooms().reduce((sum, r) => sum + r.unreadCount, 0);
      }),
    };
  }),

  withMethods((store) => {
    const appStore = inject(AppStore);
    const matrixService = inject(MatrixChatService);

    return {
      /******************************* Setters *************************** */

      setConfig(config?: ChatConfig): void {
        patchState(store, { config });
        debugData<ChatConfig | undefined>(`MatrixChatSectionStore.setConfig:`, config, store.currentUser());
      },

      setIsInitialized(isMatrixInitialized: boolean): void {
        patchState(store, { isMatrixInitialized });
      },

      setCurrentRoom(roomId: string | undefined): void {
        patchState(store, { currentRoomId: roomId });
      },

      setShowRoomList(showRoomList: boolean): void {
        patchState(store, { showRoomList });
      },

      setSelectedThread(threadId: string | undefined): void {
        patchState(store, { selectedThreadId: threadId });
      },

      /**
       * Get Matrix OIDC configuration from section properties
       * For OIDC flow, we don't get a token directly
       * Instead, we get configuration to initiate SSO login
       */
      getMatrixOidcConfig(): { homeserverUrl: string; clientId: string; redirectUri: string; scope: string } | undefined {
        const config = store.config();
        if (!config) {
          console.warn('MatrixChatSectionStore.getMatrixOidcConfig: No section config');
          return undefined;
        }

        const homeserverUrl = config.matrixHomeserver || appStore.env.services.matrixHomeserver || 'https://matrix.bkchat.etke.host';
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://seeclub.org';
        
        return {
          homeserverUrl,
          clientId: appStore.env.firebase.projectId, // Firebase project ID
          redirectUri: `${origin}/auth/matrix-callback`,
          scope: 'openid profile email',
        };
      },

      /**
       * Get Matrix authentication token from OIDC flow
       * This should be called after user returns from SSO redirect
       * The token will be in URL parameters or localStorage
       */
      async getMatrixToken(): Promise<MatrixAuthToken | undefined> {
        const user = store.currentUser();
        if (!user) {
          console.warn('MatrixChatSectionStore.getMatrixToken: No user logged in');
          return undefined;
        }

        try {
          // Check if we have a token from OIDC redirect in localStorage
          const storedToken = localStorage.getItem('matrix_access_token');
          const storedUserId = localStorage.getItem('matrix_user_id');
          const storedDeviceId = localStorage.getItem('matrix_device_id');

          if (storedToken && storedUserId) {
            debugItemLoaded(`MatrixChatSectionStore.getMatrixToken: Using stored Matrix token for ${user.bkey}`, user);
            return {
              accessToken: storedToken,
              userId: storedUserId,
              deviceId: storedDeviceId || `device_${user.bkey}`,
              homeserverUrl: appStore.env.services.matrixHomeserver || 'https://matrix.bkchat.etke.host',
            };
          }

          // If no stored token, we need to initiate OIDC flow
          const oidcConfig = this.getMatrixOidcConfig();
          if (!oidcConfig) {
            throw new Error('Failed to get OIDC configuration');
          }

          // Get Firebase ID token to use in OIDC flow
          const auth = getAuth(getApp());
          const firebaseToken = await auth.currentUser?.getIdToken();
          
          if (!firebaseToken) {
            throw new Error('No Firebase token available');
          }

          // Store Firebase token for OIDC flow
          sessionStorage.setItem('firebase_id_token', firebaseToken);
          
          // Return undefined to signal that OIDC redirect is needed
          // The component should then call initiateMatrixOidcLogin()
          return undefined;
        } catch (error) {
          console.error('MatrixChatSectionStore.getMatrixToken: Failed to get token:', error);
          return undefined;
        }
      },

      /**
       * Initiate Matrix OIDC login flow
       * This redirects the user to Matrix SSO endpoint
       */
      async initiateMatrixOidcLogin(): Promise<void> {
        try {
          const oidcConfig = this.getMatrixOidcConfig();
          if (!oidcConfig) {
            throw new Error('Failed to get OIDC configuration');
          }

          const { homeserverUrl, clientId, redirectUri, scope } = oidcConfig;

          // Get Firebase ID token
          const auth = getAuth(getApp());
          const firebaseToken = await auth.currentUser?.getIdToken();
          
          if (!firebaseToken) {
            throw new Error('No Firebase token available');
          }

          // Store state and return URL for OIDC callback
          const state = crypto.randomUUID();
          sessionStorage.setItem('oidc_state', state);
          sessionStorage.setItem('firebase_id_token', firebaseToken);
          sessionStorage.setItem('matrix_return_url', window.location.pathname + window.location.search);

          // Construct Matrix SSO login URL
          // Matrix will redirect to Firebase for authentication, then back to redirectUri
          const ssoUrl = new URL(`${homeserverUrl}/_matrix/client/v3/login/sso/redirect`);
          ssoUrl.searchParams.append('redirectUrl', redirectUri);

          debugMessage(`MatrixChatSectionStore.initiateMatrixOidcLogin: Redirecting to ${ssoUrl}`);
          
          // Redirect to Matrix SSO
          window.location.href = ssoUrl.toString();
        } catch (error) {
          console.error('MatrixChatSectionStore.initiateMatrixOidcLogin: Failed to initiate login:', error);
          throw error;
        }
      },

      /**
       * Handle OIDC callback after redirect
       * Call this when user returns from Matrix SSO
       */
      async handleMatrixOidcCallback(loginToken: string): Promise<MatrixAuthToken> {
        try {
          const homeserverUrl = appStore.env.services.matrixHomeserver || 'https://matrix.bkchat.etke.host';

          // Exchange the login token for an access token
          const response = await fetch(`${homeserverUrl}/_matrix/client/v3/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'm.login.token',
              token: loginToken,
            }),
          });

          if (!response.ok) {
            throw new Error(`Matrix login failed: ${await response.text()}`);
          }

          const data = await response.json();

          const token: MatrixAuthToken = {
            accessToken: data.access_token,
            userId: data.user_id,
            deviceId: data.device_id,
            homeserverUrl,
          };

          // Store token for future use
          localStorage.setItem('matrix_access_token', token.accessToken);
          localStorage.setItem('matrix_user_id', token.userId);
          localStorage.setItem('matrix_device_id', token.deviceId);

          // Clean up OIDC state
          sessionStorage.removeItem('oidc_state');
          sessionStorage.removeItem('firebase_id_token');

          debugMessage(`MatrixChatSectionStore.handleMatrixOidcCallback: Successfully logged in as ${token.userId}`);

          return token;
        } catch (error) {
          console.error('MatrixChatSectionStore.handleMatrixOidcCallback: Failed to handle callback:', error);
          throw error;
        }
      },

      /**
       * Initialize Matrix client
       */
      async initializeMatrix(matrixUser: MatrixUser, token: MatrixAuthToken): Promise<void> {
        if (store.isMatrixInitialized()) {
          debugMessage(`MatrixChatSectionStore.initializeMatrix: Already initialized for user ${matrixUser.id}`);
          return;
        }

        try {
          await matrixService.initialize({
            homeserverUrl: token.homeserverUrl,
            userId: token.userId,
            accessToken: token.accessToken,
            deviceId: token.deviceId,
          });

          patchState(store, { isMatrixInitialized: true });
          debugMessage(`MatrixChatSectionStore.initializeMatrix: Initialized for user ${matrixUser.id}`);

          // Skip auto-join for now - rooms need to be created first via Cloud Functions
          // TODO: Re-enable when ensureGroupRoom is called to create rooms
          // const config = store.config();
          // if (config?.id) { ... }
        } catch (error) {
          console.error('MatrixChatSectionStore.initializeMatrix: Failed to initialize:', error);
          throw error;
        }
      },

      /**
       * Ensure a room exists or create it
       */
      async ensureRoomExists(roomIdOrAlias: string, roomName?: string): Promise<string> {
        try {
          // Try to join existing room
          const room = await matrixService.joinRoom(roomIdOrAlias);
          patchState(store, { currentRoomId: room.roomId });
          return room.roomId;
        } catch (error) {
          // If join fails, room might not exist or we might not have permission
          console.warn('MatrixChatSectionStore.ensureRoomExists: Failed to join room, might need to create:', error);
          throw error;
        }
      },

      /**
       * Create a direct message room with another user
       */
      async createDirectRoom(userId: string): Promise<string> {
        if (!store.isMatrixInitialized()) {
          throw new Error('Matrix not initialized');
        }

        const room = await matrixService.createDirectRoom(userId);
        patchState(store, { currentRoomId: room.roomId });
        return room.roomId;
      },

      /**
       * Create a group room
       */
      async createGroupRoom(name: string, userIds: string[], topic?: string): Promise<string> {
        if (!store.isMatrixInitialized()) {
          throw new Error('Matrix not initialized');
        }

        const room = await matrixService.createGroupRoom(name, userIds, topic);
        patchState(store, { currentRoomId: room.roomId });
        return room.roomId;
      },

      /**
       * Send a text message
       */
      async sendMessage(text: string, threadId?: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) {
          console.warn('MatrixChatSectionStore.sendMessage: No room selected');
          return;
        }

        try {
          await matrixService.sendMessage(roomId, text, threadId);
          debugMessage(`MatrixChatSectionStore.sendMessage: Sent message to room ${roomId}`, store.currentUser());
        } catch (error) {
          console.error('MatrixChatSectionStore.sendMessage: Failed to send message:', error);
          throw error;
        }
      },

      /**
       * Send a file
       */
      async sendFile(file: File, threadId?: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) {
          console.warn('MatrixChatSectionStore.sendFile: No room selected');
          return;
        }

        try {
          await matrixService.sendFile(roomId, file, threadId);
          debugMessage(`MatrixChatSectionStore.sendFile: Sent file ${file.name} to room ${roomId}`, store.currentUser());
        } catch (error) {
          console.error('MatrixChatSectionStore.sendFile: Failed to send file:', error);
          throw error;
        }
      },

      /**
       * Send location
       */
      async sendLocation(text: string, latitude: number, longitude: number, threadId?: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) {
          console.warn('MatrixChatSectionStore.sendLocation: No room selected');
          return;
        }

        try {
          await matrixService.sendLocation(roomId, text, latitude, longitude, threadId);
          debugMessage(`MatrixChatSectionStore.sendLocation: Sent location to room ${roomId}`, store.currentUser());
        } catch (error) {
          console.error('MatrixChatSectionStore.sendLocation: Failed to send location:', error);
          throw error;
        }
      },

      /**
       * React to a message
       */
      async reactToMessage(eventId: string, emoji: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await matrixService.reactToMessage(roomId, eventId, emoji);
        } catch (error) {
          console.error('MatrixChatSectionStore.reactToMessage: Failed to react:', error);
        }
      },

      /**
       * Edit a message
       */
      async editMessage(eventId: string, newText: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await matrixService.editMessage(roomId, eventId, newText);
        } catch (error) {
          console.error('MatrixChatSectionStore.editMessage: Failed to edit:', error);
        }
      },

      /**
       * Send typing notification
       */
      async sendTyping(isTyping: boolean): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await matrixService.sendTyping(roomId, isTyping);
        } catch (error) {
          console.error('MatrixChatSectionStore.sendTyping: Failed to send typing:', error);
        }
      },

      /**
       * Send read receipt
       */
      async sendReadReceipt(eventId: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await matrixService.sendReadReceipt(roomId, eventId);
        } catch (error) {
          console.error('MatrixChatSectionStore.sendReadReceipt: Failed to send read receipt:', error);
        }
      },

      /**
       * Get messages for current room
       */
      getMessages(): Observable<MatrixMessage[]> {
        const roomId = store.currentRoomId();
        if (!roomId) {
          return of([]);
        }
        return matrixService.getMessagesForRoom(roomId);
      },

      /**
       * Search for users
       */
      async searchUsers(searchTerm: string): Promise<any[]> {
        try {
          return await matrixService.searchUsers(searchTerm);
        } catch (error) {
          console.error('MatrixChatSectionStore.searchUsers: Search failed:', error);
          return [];
        }
      },

      /**
       * Invite user to current room
       */
      async inviteUser(userId: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await matrixService.inviteUser(roomId, userId);
        } catch (error) {
          console.error('MatrixChatSectionStore.inviteUser: Failed to invite:', error);
        }
      },

      /**
       * Leave current room
       */
      async leaveRoom(): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await matrixService.leaveRoom(roomId);
          patchState(store, { currentRoomId: undefined });
        } catch (error) {
          console.error('MatrixChatSectionStore.leaveRoom: Failed to leave:', error);
        }
      },

      /**
       * Cleanup on destroy
       */
      async cleanup(): Promise<void> {
        await matrixService.disconnect();
        patchState(store, initialState);
      },
    };
  })
);
