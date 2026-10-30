import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { TerrainElevationsReq, TerrainElevationsRes } from '@okr/mobility-tracker-util';

/**
 * Wraps the `getTerrainElevations` callable (spec 1.128 §2): terrain heights for the sampled points of a Strecke
 * without (enough) GPS altitude — swisstopo in Switzerland, Open-Meteo elsewhere. Needs the network.
 */
@Injectable({ providedIn: 'root' })
export class TerrainElevationService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async heights(points: TerrainElevationsReq['points']): Promise<TerrainElevationsRes> {
    const callable = httpsCallable<TerrainElevationsReq, TerrainElevationsRes>(this.functions, 'getTerrainElevations');
    return (await callable({ points })).data;
  }
}
