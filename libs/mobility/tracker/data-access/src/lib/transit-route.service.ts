import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { TransitRouteReq, TransitRouteRes } from '@okr/mobility-tracker-util';

/**
 * Wraps the `getTransitRoute` callable (spec 1.129 §4.2): the line of a recorded train, bus or ship section from the
 * Swiss timetable (OJP 2.0). No points in the answer = none found. Needs the network.
 */
@Injectable({ providedIn: 'root' })
export class TransitRouteService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async route(req: TransitRouteReq): Promise<TransitRouteRes> {
    const callable = httpsCallable<TransitRouteReq, TransitRouteRes>(this.functions, 'getTransitRoute');
    return (await callable(req)).data;
  }
}
