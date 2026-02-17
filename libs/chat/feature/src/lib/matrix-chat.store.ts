import { computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Observable, of, switchMap } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { MatrixAuthToken, MatrixMessage, MatrixUser } from '@bk2/shared-models';
import { debugItemLoaded, debugMessage } from '@bk2/shared-util-core';

import { AvatarService } from '@bk2/avatar-data-access';
import { MatrixChatService } from '@bk2/chat-data-access';

export interface MatrixChatState {
  isMatrixInitialized: boolean;
  currentRoomId: string | undefined;
  showRoomList: boolean;
  selectedThreadId: string | undefined;
}

export const initialState: MatrixChatState = {
  isMatrixInitialized: false,
  currentRoomId: undefined,
  showRoomList: true,
  selectedThreadId: undefined,
};

export const MatrixChatStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    matrixService: inject(MatrixChatService),
    avatarService: inject(AvatarService),
  })),
  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
      matrixSyncState: toSignal(state.matrixService.syncState, { initialValue: 'STOPPED' }),
      matrixRooms: toSignal(state.matrixService.rooms, { initialValue: [] }),
    };
  }),

  withComputed((state) => {
    return {
      imageUrl: computed(() => {
        const user = state.currentUser();
        if (!user) return undefined;
        return state.avatarService.getAvatarUrl(`person.${user.personKey}`, 'person');
      }),
      homeServer: computed(() => {
        const server = state.appStore.env.services.matrixHomeserver;
        return server.replace(/^https?:\/\//, ''); // remove protocol if present, we just want the host for Matrix user IDs
      }),
    };
  }),

  withComputed((state) => {
    return {
      homeServerUrl: computed(() => `https://${state.homeServer()}`), 
      matrixUser: computed((): MatrixUser | undefined => {
        const user = state.currentUser();
        const url = state.imageUrl();
        if (!user || !url) return undefined;
        
        // Convert Firebase user to Matrix format
        // Matrix user IDs follow format: @localpart:homeserver
        const matrixUserId = `@${user.bkey}:${state.homeServer()}`;
        
        return {
          id: matrixUserId,
          name: user.firstName + ' ' + user.lastName,
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

    return {
      /******************************* Setters *************************** */

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
       * Get Matrix authentication token via simple token exchange
       * Calls Cloud Function to get credentials for any Firebase auth method
       */
      async getMatrixToken(): Promise<MatrixAuthToken | undefined> {
        const user = store.currentUser();
        if (!user) {
          console.warn('MatrixChatStore.getMatrixToken: No user logged in');
          return undefined;
        }

        try {
          // Check if we have a cached token in localStorage
          const storedToken = localStorage.getItem('matrix_access_token');
          const storedUserId = localStorage.getItem('matrix_user_id');
          const storedDeviceId = localStorage.getItem('matrix_device_id');
          const storedHomeserver = localStorage.getItem('matrix_homeserver');

          if (storedToken && storedUserId) {
            debugItemLoaded(`MatrixChatStore.getMatrixToken: Using cached Matrix token for ${user.bkey}`, user);
            return {
              accessToken: storedToken,
              userId: storedUserId,
              deviceId: storedDeviceId || `device_${user.bkey}`,
              homeserverUrl: storedHomeserver || store.appStore.env.services.matrixHomeserver,
            };
          }

          // No cached token - call Cloud Function to get Matrix credentials
          debugMessage(`MatrixChatStore.getMatrixToken: Requesting Matrix credentials from Cloud Function for ${user.bkey}`);
          
          const functions = getFunctions(getApp(), 'europe-west6');
          const getMatrixCredentials = httpsCallable(functions, 'getMatrixCredentials');
          
          const result = await getMatrixCredentials();
          const credentials = result.data as MatrixAuthToken;

          if (!credentials || !credentials.accessToken) {
            throw new Error('Cloud Function returned invalid credentials');
          }

          // Cache the token for future use
          localStorage.setItem('matrix_access_token', credentials.accessToken);
          localStorage.setItem('matrix_user_id', credentials.userId);
          localStorage.setItem('matrix_device_id', credentials.deviceId);
          localStorage.setItem('matrix_homeserver', credentials.homeserverUrl);

          debugMessage(`MatrixChatStore.getMatrixToken: Successfully got Matrix credentials for ${credentials.userId}`);

          return credentials;
        } catch (error) {
          console.error('MatrixChatStore.getMatrixToken: Failed to get token:', error);
          // Clear any invalid cached tokens
          localStorage.removeItem('matrix_access_token');
          localStorage.removeItem('matrix_user_id');
          localStorage.removeItem('matrix_device_id');
          localStorage.removeItem('matrix_homeserver');
          throw error;
        }
      },

      /**
       * Initialize Matrix client
       */
      async initializeMatrix(matrixUser: MatrixUser, token: MatrixAuthToken): Promise<void> {
        if (store.isMatrixInitialized()) {
          debugMessage(`MatrixChatStore.initializeMatrix: Already initialized for user ${matrixUser.id}`);
          return;
        }

        try {
          await store.matrixService.initialize({
            homeserverUrl: token.homeserverUrl,
            userId: token.userId,
            accessToken: token.accessToken,
            deviceId: token.deviceId,
          });

          patchState(store, { isMatrixInitialized: true });
          debugMessage(`MatrixChatStore.initializeMatrix: Initialized for user ${matrixUser.id}`);

          // Sync avatar from Firebase to Matrix if available
          if (matrixUser.imageUrl) {
            console.log('MatrixChatStore: Syncing avatar to Matrix:', matrixUser.imageUrl);
            try {
              await store.matrixService.setUserAvatarFromUrl(matrixUser.imageUrl);
              console.log('MatrixChatStore: Avatar synced successfully');
            } catch (avatarError) {
              console.warn('MatrixChatStore: Failed to sync avatar (non-critical):', avatarError);
            }
          }

          // Skip auto-join for now - rooms need to be created first via Cloud Functions
          // TODO: Re-enable when ensureGroupRoom is called to create rooms
        } catch (error) {
          console.error('MatrixChatStore.initializeMatrix: Failed to initialize:', error);
          throw error;
        }
      },

      /**
       * Ensure a room exists or create it
       */
      async ensureRoomExists(roomIdOrAlias: string, roomName?: string): Promise<string> {
        try {
          // Try to join existing room
          const room = await store.matrixService.joinRoom(roomIdOrAlias);
          patchState(store, { currentRoomId: room.roomId });
          return room.roomId;
        } catch (error) {
          // If join fails, room might not exist or we might not have permission
          console.warn('MatrixChatStore.ensureRoomExists: Failed to join room, might need to create:', error);
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

        const room = await store.matrixService.createDirectRoom(userId);
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

        const room = await store.matrixService.createGroupRoom(name, userIds, topic);
        patchState(store, { currentRoomId: room.roomId });
        return room.roomId;
      },

      /**
       * Send a text message
       */
      async sendMessage(text: string, threadId?: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) {
          console.warn('MatrixChatStore.sendMessage: No room selected');
          return;
        }

        try {
          await store.matrixService.sendMessage(roomId, text, threadId);
          debugMessage(`MatrixChatStore.sendMessage: Sent message to room ${roomId}`, store.currentUser());
        } catch (error) {
          console.error('MatrixChatStore.sendMessage: Failed to send message:', error);
          throw error;
        }
      },

      /**
       * Send a file
       */
      async sendFile(file: File, threadId?: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) {
          console.warn('MatrixChatStore.sendFile: No room selected');
          return;
        }

        try {
          await store.matrixService.sendFile(roomId, file, threadId);
          debugMessage(`MatrixChatStore.sendFile: Sent file ${file.name} to room ${roomId}`, store.currentUser());
        } catch (error) {
          console.error('MatrixChatStore.sendFile: Failed to send file:', error);
          throw error;
        }
      },

      /**
       * Send location
       */
      async sendLocation(text: string, latitude: number, longitude: number, threadId?: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) {
          console.warn('MatrixChatStore.sendLocation: No room selected');
          return;
        }

        try {
          await store.matrixService.sendLocation(roomId, text, latitude, longitude, threadId);
          debugMessage(`MatrixChatStore.sendLocation: Sent location to room ${roomId}`, store.currentUser());
        } catch (error) {
          console.error('MatrixChatStore.sendLocation: Failed to send location:', error);
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
          await store.matrixService.reactToMessage(roomId, eventId, emoji);
        } catch (error) {
          console.error('MatrixChatStore.reactToMessage: Failed to react:', error);
        }
      },

      /**
       * Edit a message
       */
      async editMessage(eventId: string, newText: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await store.matrixService.editMessage(roomId, eventId, newText);
        } catch (error) {
          console.error('MatrixChatStore.editMessage: Failed to edit:', error);
        }
      },

      /**
       * Send typing notification
       */
      async sendTyping(isTyping: boolean): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await store.matrixService.sendTyping(roomId, isTyping);
        } catch (error) {
          console.error('MatrixChatStore.sendTyping: Failed to send typing:', error);
        }
      },

      /**
       * Send read receipt
       */
      async sendReadReceipt(eventId: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await store.matrixService.sendReadReceipt(roomId, eventId);
        } catch (error) {
          console.error('MatrixChatStore.sendReadReceipt: Failed to send read receipt:', error);
        }
      },

      /**
       * Get messages for current room - returns an Observable that switches when room changes
       */
      getMessages(): Observable<MatrixMessage[]> {
        // Convert currentRoomId signal to observable and switch to the messages for that room
        return toObservable(store.currentRoomId).pipe(
          switchMap(roomId => {
            if (!roomId) {
              return of([]);
            }
            console.log(`MatrixChatStore: Switching to messages for room ${roomId}`);
            return store.matrixService.getMessagesForRoom(roomId);
          })
        );
      },

      /**
       * Search for users
       */
      async searchUsers(searchTerm: string): Promise<any[]> {
        try {
          return await store.matrixService.searchUsers(searchTerm);
        } catch (error) {
          console.error('MatrixChatStore.searchUsers: Search failed:', error);
          return [];
        }
      },

      /**
       * Set user avatar from existing URL
       */
      async setUserAvatarFromUrl(avatarUrl: string): Promise<string> {
        try {
          const matrixAvatarUrl = await store.matrixService.setUserAvatarFromUrl(avatarUrl);
          console.log('MatrixChatStore: User avatar updated successfully');
          return matrixAvatarUrl;
        } catch (error) {
          console.error('MatrixChatStore.setUserAvatarFromUrl: Failed to set avatar:', error);
          throw error;
        }
      },

      /**
       * Get current user's avatar URL
       */
      getUserAvatarUrl(width: number = 96, height: number = 96): string | undefined {
        return store.matrixService.getUserAvatarUrl(width, height);
      },

      /**
       * Invite user to current room
       */
      async inviteUser(userId: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await store.matrixService.inviteUser(roomId, userId);
        } catch (error) {
          console.error('MatrixChatStore.inviteUser: Failed to invite:', error);
        }
      },

      /**
       * Leave current room
       */
      async leaveRoom(): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;

        try {
          await store.matrixService.leaveRoom(roomId);
          patchState(store, { currentRoomId: undefined });
        } catch (error) {
          console.error('MatrixChatStore.leaveRoom: Failed to leave:', error);
        }
      },

      /**
       * Cleanup on destroy
       */
      async cleanup(): Promise<void> {
        await store.matrixService.disconnect();
        patchState(store, initialState);
      },
    };
  })
);
