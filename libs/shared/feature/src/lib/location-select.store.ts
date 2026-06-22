import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { rxResource } from '@angular/core/rxjs-interop';

import { FirestoreService } from '@bk2/shared-data-access';
import { LocationModel, UserModel } from '@bk2/shared-models';
import { chipMatches, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { LocationService } from '@bk2/location-data-access';
import { AppStore } from './app.store';
import { SHARED_FEATURE_I18N_KEYS, SharedFeatureI18n } from './select-i18n';

export const MIN_CUSTOM_SEARCH_LENGTH = 4;
export const MAX_FIT_ZOOM = 16;
export const FIT_PADDING: [number, number] = [32, 32];

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeForCompare(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function hasValidCoordinates(l: LocationModel): boolean {
  return Number.isFinite(l.latitude) && Number.isFinite(l.longitude)
    && !(l.latitude === 0 && l.longitude === 0)
    && Math.abs(l.latitude) <= 90 && Math.abs(l.longitude) <= 180;
}

export type LocationSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  type: string;
  allowCustom: boolean;
  showMap: boolean;
  mapTag: string | undefined;
  viewMode: 'list' | 'map';
};

export const locationInitialState: LocationSelectState = {
  searchTerm: '',
  currentUser: undefined,
  type: 'logbuch',
  allowCustom: false,
  showMap: false,
  mapTag: undefined,
  viewMode: 'list',
};

export const LocationSelectStore = signalStore(
  withState(locationInitialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    locationService: inject(LocationService),
    i18n: inject(I18nService).translateAll(SHARED_FEATURE_I18N_KEYS) as SharedFeatureI18n
  })),

  withProps((store) => ({
    locationsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        type: store.type()
      }),
      stream: ({ params }) => {
        return store.locationService.list(params.type, 'distance', 'asc');
      }
    })
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.appStore.isLoading()),
    locations: computed(() => store.locationsResource.value() ?? [])
  })),

  withComputed((store) => ({
    locationsCount: computed(() => store.locations()?.length ?? 0),
    filteredLocations: computed(() =>
      store.locations()?.filter((location: LocationModel) =>
        nameMatches(location.index, store.searchTerm()) &&
        chipMatches(location.type, store.type()))
    ),
    customLabel: computed(() => normalizeWhitespace(store.searchTerm())),
    hasExactMatch: computed(() => {
      const q = normalizeForCompare(store.searchTerm());
      return store.locations().some(l => normalizeForCompare(l.name) === q);
    }),
  })),

  withComputed((store) => ({
    showCustomEntry: computed(() =>
      store.allowCustom()
      && store.customLabel().length >= MIN_CUSTOM_SEARCH_LENGTH
      && !store.hasExactMatch()
    ),
    mappableLocations: computed(() =>
      (store.filteredLocations() ?? [])
        .filter(hasValidCoordinates)
        .filter(l => {
          const tag = store.mapTag();
          return tag == null || chipMatches(l.tags, tag);
        })
    ),
  })),

  withMethods((store) => ({
    setCurrentUser(currentUser: UserModel | undefined) {
      patchState(store, { currentUser });
    },
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },
    setType(type: string) {
      patchState(store, { type });
    },
    setAllowCustom(allowCustom: boolean) {
      patchState(store, { allowCustom });
    },
    setShowMap(showMap: boolean) {
      patchState(store, { showMap });
    },
    setMapTag(mapTag: string | undefined) {
      patchState(store, { mapTag });
    },
    setViewMode(viewMode: 'list' | 'map') {
      patchState(store, { viewMode });
    },
  })),
);
