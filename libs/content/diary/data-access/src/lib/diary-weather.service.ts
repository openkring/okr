import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { DiaryWeather } from '@okr/shared-models';

/** One calendar day at one coordinate — what `fetchDiaryWeather` needs and nothing more. */
export interface DiaryWeatherRequest {
  /** DateFormat.StoreDate; must be a real day (scope 'day') */
  date: string;
  latitude: number;
  longitude: number;
}

/** Wraps the `fetchDiaryWeather` callable (Task 4). `null` = Open-Meteo did not answer for that day. */
@Injectable({ providedIn: 'root' })
export class DiaryWeatherService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async fetch(request: DiaryWeatherRequest): Promise<DiaryWeather | null> {
    const callable = httpsCallable<DiaryWeatherRequest, DiaryWeather | null>(this.functions, 'fetchDiaryWeather');
    return (await callable(request)).data;
  }
}
