import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { PlanTripReq, PlanTripRes } from '@okr/mobility-transit-util';

/**
 * Wraps the `planTrip` callable (spec 1.131 §5.2): public-transport connections between two points from the Swiss
 * timetable (OJP 2.0). No connections in the answer = none found. Needs the network.
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
}
