import { Signal } from '@angular/core';

const PFX = '@flighttracker.';
const DPFX = '@flighttracker.detail.';

export const FLIGHTTRACKER_I18N_KEYS = {
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
} satisfies Record<string, string>;

export type FlighttrackerI18n = { [K in keyof typeof FLIGHTTRACKER_I18N_KEYS]: Signal<string> };
