import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { GetLogbuchTrackRes } from '@okr/mobility-tracker-util';

/**
 * Wraps the `getLogbuchTrack` callable (spec 1.123 §5.2): the route of a Logbuch trip, clipped to the outing, for a
 * crew member while the link exists. The callable decides who may see it; the client only asks.
 */
@Injectable({ providedIn: 'root' })
export class LogbuchTrackService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async get(tenantId: string, tripKey: string): Promise<GetLogbuchTrackRes> {
    const callable = httpsCallable<{ tenantId: string; tripKey: string }, GetLogbuchTrackRes>(this.functions, 'getLogbuchTrack');
    return (await callable({ tenantId, tripKey })).data;
  }
}
