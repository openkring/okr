import { Injector, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { from, map, switchMap } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import type { MatrixChatService } from '@okr/chat-data-access';
import { I18nService } from '@okr/shared-i18n';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';

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
    // Lazy: a static import of @okr/chat-data-access is the edge that dragged matrix-js-sdk
    // (198 KB transfer) before the dashboard's LCP (spec 1.49, F1). The class identity is the
    // same module instance, so injector.get() resolves the root-provided singleton.
    matrixService: ((injector: Injector) => {
      let p: Promise<MatrixChatService> | undefined;
      return () => (p ??= import('@okr/chat-data-access')
        .then(m => injector.get(m.MatrixChatService))
        // A failed chunk load must not poison the cache: drop it so the next call retries —
        // the emergency button below must be able to recover from one bad fetch.
        .catch(e => { p = undefined; throw e; }));
    })(inject(Injector)),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS)
  })),
  withProps((store) => ({
    roomsWithUnreadResource: rxResource({
      params: () => ({
        maxItems: store.maxItems(),
      }),
      stream: ({ params }) => {
        return from(store.matrixService()).pipe(
          switchMap(svc => svc.rooms),
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
