import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { FlightInfoResponse, FlightTrackerService } from '@bk2/flighttracker-data-access';

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

const PFX = '@flighttracker.';
const DPFX = '@flighttracker.detail.';

export const FlightTrackerStore = signalStore(
  withState(initialState),
  withProps(() => ({
    flightTrackerService: inject(FlightTrackerService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      title:        PFX + 'title',
      placeholder:  PFX + 'search.placeholder',
      button:       PFX + 'search.button',
      prompt:       PFX + 'search.prompt',
      detailTitle:  DPFX + 'title',
      departure:    DPFX + 'departure',
      arrival:      DPFX + 'arrival',
      aircraft:     DPFX + 'aircraft',
      live:         DPFX + 'live',
      airport:      DPFX + 'airport',
      terminal:     DPFX + 'terminal',
      gate:         DPFX + 'gate',
      delay:        DPFX + 'delay',
      scheduled:    DPFX + 'scheduled',
      estimated:    DPFX + 'estimated',
      registration: DPFX + 'registration',
      altitude:     DPFX + 'altitude',
      direction:    DPFX + 'direction',
      speed:        DPFX + 'speed',
    }),
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
