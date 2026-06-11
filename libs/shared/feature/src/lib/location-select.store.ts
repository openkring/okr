import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { LocationModel, PersonModel, UserModel } from '@bk2/shared-models';
import { chipMatches, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { LocationService } from '@bk2/location-data-access';
import { AppStore } from './app.store';
import { LOCATION_SELECT_I18N_KEYS, LocationSelectI18n } from './select-i18n';
import { rxResource } from '@angular/core/rxjs-interop';


export type LocationSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  type: string;
};

export const locationInitialState: LocationSelectState = {
  searchTerm: '',
  currentUser: undefined,
  type: 'logbuch',
};

export const LocationSelectStore = signalStore(
  withState(locationInitialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    locationService: inject(LocationService),
    i18nService: inject(I18nService)
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(LOCATION_SELECT_I18N_KEYS),
    locationsResource: rxResource({
    params: () => ({
        currentUser: store.appStore.currentUser(),
        type: store.type()
    }),
    stream: ({params}) => {
        return store.locationService.list(params.type, 'distance', 'asc');
    }
    })
  })),

  withComputed((store) => {
    return {
        isLoading: computed(() => store.appStore.isLoading()),
        locations: computed(() => store.locationsResource.value() ?? [])
    }
  }),

  withComputed((store) => {
    return {
      locationsCount: computed(() => store.locations()?.length ?? 0), 
      filteredLocations: computed(() => 
        store.locations()?.filter((location: LocationModel) => 
          nameMatches(location.index, store.searchTerm()) &&
          chipMatches(location.type, store.type()))
      )
    }
  }),

  withMethods((store) => {
    return {
      
      setCurrentUser(currentUser: UserModel | undefined) {
        patchState(store, { currentUser });
      },

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setType(type: string) {
        patchState(store, { type });
      }
    }
  }),
);
