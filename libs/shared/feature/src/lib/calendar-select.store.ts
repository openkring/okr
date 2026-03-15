import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { CalendarCollection, CalendarModel, UserModel } from '@bk2/shared-models';
import { debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';

import { AppStore } from './app.store';

export type CalendarSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
};

const calendarSelectInitialState: CalendarSelectState = {
  searchTerm: '',
  currentUser: undefined,
};

export const CalendarSelectStore = signalStore(
  withState(calendarSelectInitialState),
  withProps(() => ({
    firestoreService: inject(FirestoreService),
    appStore: inject(AppStore),
  })),
  withProps((store) => ({
    calendarsResource: rxResource({
      stream: () => store.firestoreService.searchData<CalendarModel>(
        CalendarCollection,
        getSystemQuery(store.appStore.tenantId()),
        'name', 'asc'
      ).pipe(debugListLoaded('calendars (to select)', store.currentUser()))
    })
  })),
  withComputed((store) => ({
    calendars: computed(() => store.calendarsResource.value() ?? []),
    filteredCalendars: computed(() =>
      (store.calendarsResource.value() ?? []).filter((c: CalendarModel) =>
        nameMatches(c.index, store.searchTerm())
      )
    ),
    isLoading: computed(() => store.calendarsResource.isLoading()),
  })),
  withMethods((store) => ({
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },
    setCurrentUser(currentUser: UserModel | undefined) {
      patchState(store, { currentUser });
    },
  })),
);
