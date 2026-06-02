import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { FlightInfoResponse, FlightTrackerService } from '@bk2/flighttracker-data-access';
import { FLIGHTTRACKER_I18N_KEYS, FlighttrackerI18n } from '@bk2/geo-flighttracker-util';
export type { FlighttrackerI18n };

export type FlightTrackerState = {
  flightNumber: string;
  date: string;
  flightData: FlightInfoResponse | null;
  isLoading: boolean;
  error: string | null;
};

const today = (): string => new Date().toISOString().split('T')[0];

const initialState: FlightTrackerState = {
  flightNumber: '',
  date: today(),
  flightData: null,
  isLoading: false,
  error: null,
};

export const FlightTrackerStore = signalStore(
  withState(initialState),
  withProps(() => ({
    flightTrackerService: inject(FlightTrackerService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(FLIGHTTRACKER_I18N_KEYS),
  })),
  withMethods((store) => ({
    setFlightNumber(flightNumber: string): void {
      patchState(store, { flightNumber });
    },

    setDate(date: string): void {
      patchState(store, { date });
    },

    async search(): Promise<void> {
      if (!store.flightNumber().trim()) return;
      patchState(store, { isLoading: true, error: null, flightData: null });
      try {
        const data = await store.flightTrackerService.getFlightInfo(
          store.flightNumber().trim(),
          store.date()
        );
        patchState(store, { flightData: data, isLoading: false });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '@flighttracker.error.generic';
        patchState(store, { error: message, isLoading: false });
      }
    },

    async reload(): Promise<void> {
      return this.search();
    },
  }))
);
