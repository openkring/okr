import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { map } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { MatrixChatService } from '@bk2/chat-data-access';
import { I18nService } from '@bk2/shared-i18n';

import { MESSAGES_SECTION_I18N_KEYS, MessagesSectionI18n } from '@bk2/cms-section-util';
export type { MessagesSectionI18n };

export type MessagesState = {
  maxItems: number | undefined; // max items to show, undefined means all
};

export const initialState: MessagesState = {
  maxItems: undefined,
};

export const MessagesStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    matrixService: inject(MatrixChatService),
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(MESSAGES_SECTION_I18N_KEYS),

    roomsWithUnreadResource: rxResource({
      params: () => ({
        maxItems: store.maxItems(),
      }),
      stream: ({ params }) => {
        return store.matrixService.rooms.pipe(
          map(rooms => {
            const unreadRooms = rooms
              .filter(r => r.unreadCount > 0)
              .sort((a, b) => {
                // Most recent last message first
                const aTime = a.lastMessage?.timestamp ?? 0;
                const bTime = b.lastMessage?.timestamp ?? 0;
                return bTime - aTime;
              });
            return params.maxItems !== undefined
              ? unreadRooms.slice(0, params.maxItems)
              : unreadRooms;
          })
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      rooms: computed(() => state.roomsWithUnreadResource.value() ?? []),
      isLoading: computed(() => state.roomsWithUnreadResource.isLoading()),
      currentUser: computed(() => state.appStore.currentUser()),
    }
  }),

  withMethods((store) => {
    return {
      setConfig(maxItems?: number): void {
        patchState(store, { maxItems });
      },
    }
  })
);
