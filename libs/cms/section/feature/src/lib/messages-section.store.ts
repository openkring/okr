import { Injector, computed, inject } from '@angular/core';
import { lazyService } from '@okr/shared-util-angular';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { catchError, combineLatest, from, map, of, startWith, switchMap } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { MatrixRoom } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';

type MessagesSnapshot = {
  status: 'loading' | 'error' | 'ready';
  rooms: MatrixRoom[];
};

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
    // Lazy: a static import here would drag matrix-js-sdk before the LCP (spec 1.49, F1).
    matrixService: lazyService(inject(Injector), () =>
      import('@okr/chat-data-access').then(m => m.MatrixChatService)),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS)
  })),
  withProps((store) => ({
    roomsWithUnreadResource: rxResource({
      params: () => ({
        maxItems: store.maxItems(),
      }),
      stream: ({ params }) => {
        return from(store.matrixService()).pipe(
          switchMap(svc => {
            // Start the Matrix client as soon as this section is on screen — the dashboard is
            // the landing page, so this is the earliest useful moment. Idempotent and
            // promise-cached (ARCH-1): a later chat page or the early-init listener reuse it.
            const init$ = from(svc.ensureInitialized()).pipe(
              map(() => false),
              catchError(err => {
                console.warn('MessagesStore: Matrix init failed', err);
                return of(true);
              }),
              startWith(false),
            );
            return combineLatest([svc.rooms, svc.roomsLoaded, svc.syncState, init$]).pipe(
              map(([rooms, roomsLoaded, syncState, initFailed]): MessagesSnapshot => {
                // `rooms` is [] before the initial sync, which is indistinguishable from a
                // user without unread rooms — only roomsLoaded tells the two apart.
                if (!roomsLoaded) {
                  return { status: initFailed || syncState === 'ERROR' ? 'error' : 'loading', rooms: [] };
                }
                const unreadRooms = rooms
                  .filter(r => r.unreadCount > 0)
                  .sort((a, b) => {
                    // Most recent last message first
                    const aTime = a.lastMessage?.timestamp ?? 0;
                    const bTime = b.lastMessage?.timestamp ?? 0;
                    return bTime - aTime;
                  });
                return {
                  status: 'ready',
                  rooms: params.maxItems !== undefined ? unreadRooms.slice(0, params.maxItems) : unreadRooms,
                };
              }),
            );
          }),
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      rooms: computed(() => state.roomsWithUnreadResource.value()?.rooms ?? []),
      // Loading until the room list reflects the initial sync (module load + client start +
      // first /sync); never "no messages" before that.
      isLoading: computed(() => (state.roomsWithUnreadResource.value()?.status ?? 'loading') === 'loading'),
      hasError: computed(() => state.roomsWithUnreadResource.value()?.status === 'error'),
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
