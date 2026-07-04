import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { City } from '@okr/shared-models';
import { CityDataService } from './city-data.service';

export type CitySearchState = {
  searchTerm: string;      // lowercase
  countryCode: string;     // uppercase
  cities: City[];          // dataset for the current country
  loading: boolean;
};

const initialState: CitySearchState = { searchTerm: '', countryCode: '', cities: [], loading: false };

export const CitySearchStore = signalStore(
  withState(initialState),
  withProps(() => ({ cityDataService: inject(CityDataService) })),
  withComputed((state) => ({
    filteredCities: computed(() => {
      const term = state.searchTerm();
      if (!term) return [];
      return state.cities().filter((c: City) =>
        c.name.toLowerCase().includes(term) || c.zipCode.startsWith(term));
    }),
  })),
  withMethods((store) => ({
    setSearchTerm(term: string) {
      patchState(store, { searchTerm: term.toLowerCase() });
    },
    async setCountry(countryCode: string) {
      const cc = (countryCode ?? '').toUpperCase();
      if (cc === store.countryCode()) return;
      patchState(store, { countryCode: cc, cities: [], loading: true, searchTerm: '' });
      const cities = await store.cityDataService.load(cc);
      // ignore stale loads if the country changed meanwhile
      if (store.countryCode() === cc) patchState(store, { cities, loading: false });
    },
  })),
);
