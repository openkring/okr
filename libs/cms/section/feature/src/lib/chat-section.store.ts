import { HttpClient } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { catchError, from, map, Observable, of } from 'rxjs';
import { ChannelService, ChatClientService, StreamI18nService } from 'stream-chat-angular';

import { AppStore } from '@bk2/shared-feature';
import { CHAT_CONFIG_SHAPE, ChatConfig, DefaultLanguage } from '@bk2/shared-models';
import { debugData, debugItemLoaded, debugMessage, die } from '@bk2/shared-util-core';

import { AvatarService } from '@bk2/avatar-data-access';
import { Languages } from '@bk2/shared-categories';

export interface ChatUser {
  id: string;
  name: string;
  imageUrl: string;
}

export interface ChatSectionState {
  config: ChatConfig | undefined;
  isChatInitialized: boolean;
}

export const initialState: ChatSectionState = {
  config: undefined,
  isChatInitialized: false
};

export const ChatSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    avatarService: inject(AvatarService),
    http: inject(HttpClient),
    chatService: inject(ChatClientService),
    channelService: inject(ChannelService),
    streamI18nService: inject(StreamI18nService)
  })),

  withComputed((state) => {
    return {
      imgixBaseUrl: computed(() => state.appStore.services.imgixBaseUrl()),
      currentUser: computed(() => state.appStore.currentUser()),
    };
  }),

  withProps((store) => ({
    imageUrlResource: rxResource({
      params: () => ({
        currentUser: store.currentUser()
      }),
      stream: ({params}): Observable<string | undefined> => {
        if (!params.currentUser) {
          debugMessage(`ChatSectionStore.imageUrlResource: No user, can't load image.`);
          return of(undefined);
        }
        const url$ = store.avatarService.getAvatarImgixUrl(`person.${params.currentUser.personKey}`, "person");
        debugItemLoaded<string>(`ChatSectionStore.imageUrlResource: image URL for ${params.currentUser.personKey}`, url$, store.currentUser());
        return url$;
      }
    }),

    /**
     * For security reasons, the secret key should never be stored in the client code.
     * That's why we have a Firebase Cloud Function that generates the user token.
     * 
     * see: https://gyfchong.medium.com/authenticating-your-app-users-with-getstream-io-c78693e0ac9b
     * For testing purposes, hardcoded tokens can be used.
     * They are generated per user here (given the userId and the appSecret): 
     * https://getstream.io/chat/docs/react/token_generator?_gl=1*aesoge*_up*MQ..*_ga*MTgwMDMxNjMzMi4xNzQ3OTk4MzUw*_ga_FX552ZCLHK*czE3NDc5OTgzNDkkbzEkZzAkdDE3NDc5OTgzNDkkajAkbDAkaDEzNTg3NzUyNDQkZDVJUG10dHUxWHJGYUpxRmpJOGFySklsbjRxeDNsVy1xRXc.
     * We are using the Firebase SDK to call the onCall function getStreamUserToken to get the token.
     */
    userTokenResource: rxResource({
      params: () => ({
        currentUser: store.currentUser()
      }),
      stream: ({params}): Observable<string | undefined> => {
        // Guard that the user is actually logged in.
        if (!params.currentUser) {
          debugMessage(`ChatSectionStore.userTokenResource: No user, can't call function.`);
          return of(undefined);
        }
        try {
          // Get a reference to the Firebase Functions service.
          const functions = getFunctions(getApp(), 'europe-west6'); // Use the correct region for your functions. 
          if (store.appStore.env.useEmulators) {
            connectFunctionsEmulator(functions, 'localhost', 5001);
          }
          
          // Create a callable reference to your specific function.
          const getStreamUserToken = httpsCallable(functions, 'getStreamUserToken');

          // Call the function. You don't need to pass any data, as the
          // function gets the user ID from the authentication context.
          const token$ = from(getStreamUserToken()).pipe(
            map(result => result.data as string),
            catchError(err => {
              console.error('ChatSectionStore.userTokenResource: Token fetch error:', err);
              return of(undefined);
            })
          ); 
          debugItemLoaded(`ChatSectionStore.userTokenResource: user token for ${params.currentUser.bkey}`, token$, params.currentUser);
          return token$;
        } catch (error) {
          console.error('ChatSectionStore.userTokenResource: Error preparing to call getStreamUserToken function:', error);
          return of(undefined);
        }
      }
    }),
  })),

  withComputed((state) => {
    return {
      imageUrl: computed(() => state.imageUrlResource.value()),
      userToken: computed(() => state.userTokenResource.value()),
    }
  }),

  withComputed((state) => {
    return {
      isLoading: computed(() => state.imageUrlResource.isLoading()),
      error: computed(() => state.imageUrlResource.error()),
      chatUser: computed((): ChatUser | undefined => {
        const user = state.currentUser();
        const url = state.imageUrl();
        if (!user || !url) return undefined;
        return {
          id: user.bkey,
          name: user.firstName,
          imageUrl: url
        };
      })
    }
  }),

  withMethods((store) => {
    return {
      /******************************* Setters *************************** */

      setConfig(config?: ChatConfig): void {
        config ??= CHAT_CONFIG_SHAPE;
        patchState(store, { config });
        debugData<ChatConfig | undefined>(`ChatSectionStore.setConfig:`, config, store.currentUser());
      },

      setIsInitialized(isChatInitialized: boolean): void {
        patchState(store, { isChatInitialized });
      },

      async initializeChat(chatUser: ChatUser, token: string): Promise<void> {
        // a guard to ensure initilialization is only done once per user session
        if (store.isChatInitialized()) {
          debugMessage(`ChatSectionStore.initializeChat: Chat already initialized for user ${chatUser.id}`);
          return; // Skip if already initialized
        }

        store.chatService.init(store.appStore.env.services.chatStreamApiKey, chatUser.id, token);
        patchState(store, { isChatInitialized: true }); // Mark as initialized

        try {
          const langCode = store.currentUser()?.userLanguage || DefaultLanguage;
          const lang = Languages[langCode].abbreviation;
          await store.streamI18nService.setTranslation(lang);
          console.log(`ChatSectionStore.initializeChat: Setting chat language to ${lang} (${langCode})`);
        } catch (error) {
          console.error(`ChatSectionStore.initializeChat: Failed to set German translation:`, error);
          // Fallback: proceed without translation or use default
        }

        const config = store.config() ?? die('ChatSectionStore.initializeChat: No config found.');
        const channel = store.chatService.chatClient.channel(config.type ?? 'messaging', config.id, {
          image: config.url ?? '',
          name: config.name ?? '',
        } as any);
        await channel.watch();

        store.channelService.init({
          type: config.type ?? 'messaging',
          id: { $eq: config.id ?? 'chat' },
        });
        debugMessage(`ChatSectionStore.initializeChat: Chat initialized for user ${chatUser.id}`);
      },

      async sendLocationMessage(channelId: string, text: string, latitude: number, longitude: number): Promise<void> {
        if (!store.isChatInitialized()) return;

        const client = store.chatService.chatClient;
        const channel = client.channel('messaging', channelId);
        await channel.watch();
        // example: https://www.google.com/maps/@47.247628,8.71838,14z
        // https://www.google.com/maps/search/?api=1&query=47.5951518%2C-122.3316393&zoom=20&basemap=terrain
        // https://www.google.com/maps/@?api=1&map_action=map&center=47.5951518,-122.3316393&zoom=14&basemap=terrain
        const message = `${text}: https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&zoom=20&basemap=terrain`;
        await this.sendMessage(channelId, message, []);

        debugMessage(`ChatSectionStore.sendLocationMessage: Sent location ${latitude},${longitude} to channel ${channelId}`, store.currentUser());
      },

      async sendMessage(channelId: string, text: string, attachments: any[] = []): Promise<void> {
        if (!store.isChatInitialized()) return;

        const client = store.chatService.chatClient;
        const channel = client.channel('messaging', channelId);
        await channel.watch();

        await channel.sendMessage({ text, attachments });
      }
    };
  })
);


  // tbd: support for multiple channels
  // tbd: support for multiple users
  // tbd: support for audio/video calls
