import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { DeparturesReq, DeparturesRes, PlanTripReq, PlanTripRes, SearchStopsReq, SearchStopsRes } from '@okr/mobility-transit-util';

/**
 * Wraps the Swiss-timetable callables (OJP 2.0): `planTrip` (spec 1.131 §5.2, connections between two points),
 * `searchStops` and `getDepartures` (spec 1.130 §5.2, the departure board). Empty lists in an answer = nothing
 * found. All need the network.
 */
@Injectable({ providedIn: 'root' })
export class TransitService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async planTrip(req: PlanTripReq): Promise<PlanTripRes> {
    const callable = httpsCallable<PlanTripReq, PlanTripRes>(this.functions, 'planTrip');
    return (await callable(req)).data;
  }

  public async searchStops(req: SearchStopsReq): Promise<SearchStopsRes> {
    const callable = httpsCallable<SearchStopsReq, SearchStopsRes>(this.functions, 'searchStops');
    return (await callable(req)).data;
  }

  public async departures(req: DeparturesReq): Promise<DeparturesRes> {
    const callable = httpsCallable<DeparturesReq, DeparturesRes>(this.functions, 'getDepartures');
    return (await callable(req)).data;
  }
}
