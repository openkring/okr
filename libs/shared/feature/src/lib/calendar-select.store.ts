import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { CalendarCollection, CalendarModel, UserModel } from '@bk2/shared-models';
import { debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { AppStore } from './app.store';
import { PFX } from './scope';


const CALENDAR_SELECT_I18N_KEYS = {
  calendar_select:            PFX + 'calendar.select',
  calendar_empty:            PFX + 'calendar.empty'
}

export type CalendarSelectI18n = { [K in keyof typeof CALENDAR_SELECT_I18N_KEYS]: Signal<string> };

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
    i18nService: inject(I18nService)
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(CALENDAR_SELECT_I18N_KEYS),

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
