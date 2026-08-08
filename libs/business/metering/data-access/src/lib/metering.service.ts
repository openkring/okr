import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { CommissionEntryCollection, CommissionEntryModel, MeteringRecordCollection, MeteringRecordModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

/** What `runCommission` returns (`apps/functions/src/business/index.ts`). */
export interface RunCommissionResponse {
  entries: number;
  total: number;
}

/**
 * Read side of the metering ledger (C3 §6/§7) — bkaiser-side, in tenant `kring`.
 *
 * There is **no write path here at all**, by design: metering records are written by the ingest
 * Cloud Function with the Admin SDK, and commission entries by `runCommission`. Both are the
 * evidence the 10 % share is audited from; a client that could edit them would make the audit
 * worthless. The only mutation this service offers is *triggering* the run.
 *
 * Both lists are fetched whole per collection and filtered by period client-side. The volume is
 * partners × their tenants × months — a few thousand rows at the horizon of this business — and
 * a server-side `period` filter would buy a composite index per collection for nothing.
 */
@Injectable({ providedIn: 'root' })
export class MeteringService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  private readonly tenantId = this.env.tenantId;

  public listRecords(): Observable<MeteringRecordModel[]> {
    return this.firestoreService.searchData<MeteringRecordModel>(
      MeteringRecordCollection, getSystemQuery(this.tenantId), 'period', 'desc');
  }

  public listEntries(): Observable<CommissionEntryModel[]> {
    return this.firestoreService.searchData<CommissionEntryModel>(
      CommissionEntryCollection, getSystemQuery(this.tenantId), 'period', 'desc');
  }

  /**
   * C3 §7's monthly run. Errors are not caught here — this is a critical, user-initiated write and
   * the feature layer decides how to surface a failure (mirrors `FeatureSelectionService.apply`).
   */
  public async runCommission(period: string): Promise<RunCommissionResponse> {
    const fn = httpsCallable<{ period: string }, RunCommissionResponse>(this.functions, 'runCommission');
    const result = await fn({ period });
    return result.data;
  }
}
