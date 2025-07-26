import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { HttpClient } from '@angular/common/http';
import { catchError, from, map, Observable, of } from 'rxjs';
import { rxResource } from '@angular/core/rxjs-interop';
import { ChannelService, ChatClientService, StreamI18nService } from 'stream-chat-angular';
import { getApp } from 'firebase/app';

import { ChatConfig, ModelType } from '@bk2/shared/models';
import { debugData, debugItemLoaded, debugMessage, die } from '@bk2/shared/util-core';
import { AppStore } from '@bk2/shared/feature';

import { newChatConfig } from '@bk2/cms/section/util';
import { AvatarService } from '@bk2/avatar/data-access';

export interface ChatUser {
  id: string;
  name: string;
  imageUrl: string;
}

export interface ChatSectionState {
  config: ChatConfig | undefined;
}

export const initialState: ChatSectionState = {
  config: undefined,
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
        const _url$ = store.avatarService.getAvatarImgixUrl(ModelType.Person + '.' + params.currentUser.personKey)
        debugItemLoaded<string>(`ChatSectionStore.imageUrlResource: image URL for ${params.currentUser.personKey}`, _url$, store.currentUser());
        return _url$;
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
        const _user = state.currentUser();
        const _url = state.imageUrl();
        if (!_user || !_url) return undefined;
        return {
          id: _user.bkey,
          name: _user.firstName,
          imageUrl: _url
        };
      })
    }
  }),

  withMethods((store) => {
    return {
      /******************************* Setters *************************** */

      setConfig(config?: ChatConfig): void {
        config ??= newChatConfig(store.appStore.env.services.imgixBaseUrl);
        patchState(store, { config });
        debugData<ChatConfig | undefined>(`ChatSectionStore.setConfig:`, config, store.currentUser());
      },

      async initializeChat(chatUser: ChatUser, token: string): Promise<void> {
        store.chatService.init(store.appStore.env.services.chatStreamApiKey, chatUser.id, token); 
        store.streamI18nService.setTranslation();
        const _config = store.config() ?? die('ChatSectionStore.initializeChat: No config found.');
        const channel = store.chatService.chatClient.channel(_config.channelType ?? 'messaging', _config.channelId, {
          image: _config.channelImageUrl ?? '',
          name: _config.channelName ?? '',
        });
        await channel.create();

        store.channelService.init({
          type: _config.channelType ?? 'messaging',
          id: { $eq: _config.channelId ?? 'chat' },
        });
        debugMessage(`ChatSectionStore.initializeChat: Chat initialized for user ${chatUser.id}`);
      }
    };
  })
);


  // tbd: support for multiple channels
  // tbd: support for multiple users
  // tbd: support for audio/video calls
