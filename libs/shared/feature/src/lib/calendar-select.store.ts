import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { CalendarCollection, CalendarModel, UserModel } from '@bk2/shared-models';
import { debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { AppStore } from './app.store';
import { SHARED_FEATURE_I18N_KEYS, SharedFeatureI18n } from './select-i18n';

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
    i18n: inject(I18nService).translateAll(SHARED_FEATURE_I18N_KEYS) as SharedFeatureI18n
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
