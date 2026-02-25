import { computed, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { of, switchMap } from 'rxjs';
import { Visibility } from 'matrix-js-sdk';
import { ModalController, ToastController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { MatrixAuthToken, MatrixRoom, MatrixUser, ROOM_SHAPE } from '@bk2/shared-models';
import { debugItemLoaded, debugMessage } from '@bk2/shared-util-core';
import { showToast } from '@bk2/shared-util-angular';

import { AvatarService } from '@bk2/avatar-data-access';
import { MatrixChatService } from '@bk2/chat-data-access';

import { RoomEditModal } from './room-edit.modal';

export type MatrixChatState = {
  isMatrixInitialized: boolean;
  currentRoomId: string | undefined;
  selectedThreadId: string | undefined;
}

export const initialState: MatrixChatState = {
  isMatrixInitialized: false,
  currentRoomId: undefined,
  selectedThreadId: undefined,
};

export const _MatrixChatStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    matrixService: inject(MatrixChatService),
    avatarService: inject(AvatarService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
  })),
  withProps((store) => ({
    syncStateResource: rxResource({ stream: () => store.matrixService.syncState }),
    roomsResource: rxResource({ stream: () => store.matrixService.rooms }),
    imageUrlResource: rxResource({
      params: () => ({
        user: store.appStore.currentUser(),
        imgixBaseUrl: store.appStore.services.imgixBaseUrl(),
      }),
      stream: ({ params }) => {
        const { user, imgixBaseUrl } = params;
        if (!user) return of(undefined);
        return store.avatarService.getRelStorageUrl(`person.${user.personKey}`).pipe(
          switchMap(relStorageUrl =>
            of(relStorageUrl ? `${imgixBaseUrl}/${relStorageUrl}` : undefined)
          )
        );
      },
    }),
    /**
     * Get messages for current room - returns an Observable that switches when room changes
     */
    messagesResource: rxResource({
      params: () => ({
        currentRoomId: store.currentRoomId(),
      }),
      stream: ({ params }) => {
        const { currentRoomId } = params;
        if (!currentRoomId) return of([]);
        console.log(`MatrixChatStore: Switching to messages for room ${currentRoomId}`);
        return store.matrixService.getMessagesForRoom(currentRoomId);
      },
    }),
  })),
  withComputed((state) => {
    return {
      currentUser: computed(() => state.appStore.currentUser()),
      imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
      syncState: computed(() => state.syncStateResource.value() || 'STOPPED'),
      rooms: computed(() => state.roomsResource.value() || []),
      imageUrl: computed(() => state.imageUrlResource.value()),
      homeServer: computed(() => {
        return state.appStore.env.services.matrixHomeserver.replace(/^https?:\/\//, '');
      }),
      messages: computed(() => state.messagesResource.value() || []),
    };
  }),

  withComputed((state) => {
    return {
      homeServerUrl: computed(() => `https://${state.homeServer()}`), 
      matrixUser: computed((): MatrixUser | undefined => {
        const user = state.currentUser();
        if (!user) return undefined;
        return {
          id: `@${user.bkey}:${state.homeServer()}`,
          name: user.firstName + ' ' + user.lastName,
          imageUrl: state.imageUrl() ?? '',
        };
      }),

      currentRoom: computed(() => {
        const roomId = state.currentRoomId();
        if (!roomId) return undefined;
        const rooms = state.rooms();
        return rooms.find(r => r.roomId === roomId)
          ?? rooms.find(r => r.name?.toLowerCase() === roomId.toLowerCase());
      }),

      unreadRooms: computed(() => {
        return state.rooms().filter(r => r.unreadCount > 0);
      }),

      totalUnreadCount: computed(() => {
        return state.rooms().reduce((sum, r) => sum + r.unreadCount, 0);
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
          const stored = store.matrixService.getStoredCredentials();
          if (stored) {
            debugItemLoaded(`MatrixChatStore.getMatrixToken: Using cached Matrix token for ${user.bkey}`, user);
            return {
              ...stored,
              homeserverUrl: stored.homeserverUrl || store.appStore.env.services.matrixHomeserver,
              deviceId: stored.deviceId || `device_${user.bkey}`,
            } as MatrixAuthToken;
          }

          debugMessage(`MatrixChatStore.getMatrixToken: Requesting Matrix credentials from Cloud Function for ${user.bkey}`, user);
          const functions = getFunctions(getApp(), 'europe-west6');
          const getMatrixCredentials = httpsCallable(functions, 'getMatrixCredentials');
          const result = await getMatrixCredentials();
          const credentials = result.data as MatrixAuthToken;

          if (!credentials || !credentials.accessToken) {
            throw new Error('Cloud Function returned invalid credentials');
          }

          store.matrixService.storeCredentials(credentials);
          debugMessage(`MatrixChatStore.getMatrixToken: Successfully got Matrix credentials for ${credentials.userId}`, user);
          return credentials;
        } catch (error) {
          console.error('MatrixChatStore.getMatrixToken: Failed to get token:', error);
          store.matrixService.clearStoredCredentials();
          throw error;
        }
      },

      clearCredentials(): void {
        store.matrixService.clearStoredCredentials();
      },

      /**
       * Initialize Matrix client
       */
      async initializeMatrix(matrixUser: MatrixUser, token: MatrixAuthToken): Promise<void> {
        if (store.isMatrixInitialized()) {
          debugMessage(`MatrixChatStore.initializeMatrix: Already initialized for user ${matrixUser.id}`, store.currentUser());
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
          debugMessage(`MatrixChatStore.initializeMatrix: Initialized for user ${matrixUser.id}`, store.currentUser());

          // Sync avatar from Firebase to Matrix if available
/*.  let's do this later         
  if (matrixUser.imageUrl) {
            console.log('MatrixChatStore: Syncing avatar to Matrix:', matrixUser.imageUrl);
            try {
              await store.matrixService.setUserAvatarFromUrl(matrixUser.imageUrl);
              console.log('MatrixChatStore: Avatar synced successfully');
            } catch (avatarError) {
              console.warn('MatrixChatStore: Failed to sync avatar (non-critical):', avatarError);
            }
          } */

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
       * Create a new room.
       */
      async createRoom(room?: MatrixRoom) {
        room = room ? room : ROOM_SHAPE;
        const modal = await store.modalController.create({
          component: RoomEditModal,  // Assume a new standalone component for input name/users
          componentProps: {
            room,
            currentUser: store.currentUser()
          }
        });
        await modal.present();
        const { data, role } = await modal.onDidDismiss();
        const roomInfo = data as MatrixRoom;
        let roomId = '';
        if (role === 'confirm' && data) {
          // const invites = roomInfo.invite ? roomInfo.invite.split(',').map(s => s.trim()) : [];
          const invites: string[] = []; // for now we skip invites, as we don't have a way to select users in the form yet  
          try {
            if (roomInfo.isDirect) {
              roomId = await this.createDirectRoom(invites[0]);
            } else {
              roomId = await this.createGroupRoom(roomInfo.name, invites, roomInfo.topic, Visibility.Private);
            }
            showToast(store.toastController, '@chat.operation.create.conf');
            patchState(store, { currentRoomId: roomId });

          } catch (error) {
            console.error('MatrixChatStore.createRoom: Failed to create room:', error);
            showToast(store.toastController, '@chat.operation.create.error');
          }
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
      async createGroupRoom(name: string, userIds: string[], topic?: string, visibility = Visibility.Private): Promise<string> {
        if (!store.isMatrixInitialized()) {
          throw new Error('Matrix not initialized');
        }

        const room = await store.matrixService.createGroupRoom(name, userIds, topic, visibility);
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
          const currentMxc = store.matrixService.getCurrentUser()?.avatarUrl;  // Check current Matrix avatar MXC
          if (currentMxc) {
            console.log('MatrixChatStore: Avatar already set, skipping sync');
            return currentMxc;
          }
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


@Injectable({
  providedIn: 'root'
})
export class MatrixChatStore extends _MatrixChatStore {
  constructor() {
    super();
  }
}