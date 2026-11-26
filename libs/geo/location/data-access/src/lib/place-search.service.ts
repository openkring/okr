import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { PlaceHit } from '@okr/location-util';

// Redeclared from the `getTerrainElevations` callable (see TerrainElevationService in mobility-tracker-data-access)
// so that location-data-access does not depend on the mobility libs.
interface TerrainElevationsReq {
  points: { lat: number; lng: number }[];
}
interface TerrainElevationsRes {
  alts: (number | null)[];
}

interface SearchPlacesReq {
  text: string;
}
/** The gateway envelope of the `searchPlaces` callable. */
interface SearchPlacesRes {
  data: PlaceHit[];
}

/** Client of the `searchPlaces` (swisstopo place search) and `getTerrainElevations` callables. Needs the network. */
@Injectable({ providedIn: 'root' })
export class PlaceSearchService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  /** Places matching the free text; `[]` on any error. Never sends a position (it would fragment the server cache). */
  public async search(text: string): Promise<PlaceHit[]> {
    try {
      const callable = httpsCallable<SearchPlacesReq, SearchPlacesRes>(this.functions, 'searchPlaces');
      return (await callable({ text })).data.data ?? [];
    } catch {
      return [];
    }
  }

  /** Terrain height in metres above sea level at a point; undefined if unknown or on error. */
  public async seaLevelOf(lat: number, lng: number): Promise<number | undefined> {
    try {
      const callable = httpsCallable<TerrainElevationsReq, TerrainElevationsRes>(this.functions, 'getTerrainElevations');
      const point = { lat, lng };
      const alt = (await callable({ points: [point, point] })).data.alts[0];
      return typeof alt === 'number' ? alt : undefined;
    } catch {
      return undefined;
    }
  }
}
