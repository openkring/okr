import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ENV } from '@bk2/shared-config';
import { SwissCity } from '@bk2/shared-models';

import { SwissCitiesService } from './swisscities.service';

export type SwissCitiesSearchState = {
  searchTerm: string | undefined;     // lowercase search term
};

export const initialState: SwissCitiesSearchState = {
  searchTerm: '',
};

export const SwissCitiesSearchStore = signalStore(
  withState(initialState),
  withProps(() => ({
    env: inject(ENV),
    swissCitiesService: inject(SwissCitiesService),
  })),

  withComputed((state) => {
    return {
      cities: computed(() => state.swissCitiesService.cities),
      citiesCount: computed(() => state.swissCitiesService.cities.length ?? 0), 
      filteredCities: computed(() => {
        const _searchTerm = state.searchTerm();
        if (_searchTerm && _searchTerm.length > 0) {
          return state.swissCitiesService.cities?.filter((city: SwissCity) => 
            city.name.toLowerCase().includes(_searchTerm) ||
            city.zipCode.startsWith(_searchTerm));
        }
        else return [];
      }),
    };
  }),

  withMethods((store) => {
    return {      
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm: searchTerm.toLowerCase() });
      }
    }
  }),
);
