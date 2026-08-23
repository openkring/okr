import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@okr/shared-data-access';
import { CalendarCollection, CalendarModel, UserModel } from '@okr/shared-models';
import { canWriteCalendar, debugListLoaded, getSystemQuery, nameMatches } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

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
    // org-owned calendars ('public', the tenant calendar, …) are editorial content: only a
    // contentAdmin may assign a calevent to them, so they are not even offered to anybody else.
    filteredCalendars: computed(() =>
      (store.calendarsResource.value() ?? []).filter((c: CalendarModel) =>
        nameMatches(c.index, store.searchTerm()) && canWriteCalendar(c, store.currentUser())
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
