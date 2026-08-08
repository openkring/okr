import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { ProspectCollection, ProspectModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

/** What `revokeProspect` returns (`apps/functions/src/business/prospect.ts`). */
export interface RevokeProspectResponse {
  ok: boolean;
  /** `PartnerModel.okey` of the partner holding the claim at the moment of revocation; '' if none. */
  partnerToNotify: string;
  partnerName: string;
}

/**
 * Read side of the prospect pool (C5), bkaiser-side in tenant `kring`.
 *
 * **There is no write path here at all.** A prospect is created by `submitProspect` from the
 * public signup, claimed and released by the partner-facing callables, and converted only by an
 * observed metering push (C5 §7 — never self-declared). `firestore.rules` matches that: the
 * collection is admin-**read**, `allow write: if false`. An admin who could edit a claim from this
 * screen could also register a conversion by hand, which is the one thing the observed definition
 * of "converted" exists to make impossible.
 *
 * The single mutation offered is the revocation, and that goes through a callable too — because it
 * has to report back which partner must now be told to stop (C5 §7).
 */
@Injectable({ providedIn: 'root' })
export class ProspectService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  private readonly tenantId = this.env.tenantId;

  /** Newest first: the pool is worked from the top, and a fresh lead is the one worth acting on. */
  public list(): Observable<ProspectModel[]> {
    return this.firestoreService.searchData<ProspectModel>(
      ProspectCollection, getSystemQuery(this.tenantId), 'consentAt', 'desc');
  }

  /**
   * C5 §7 — a revocation beats an active claim, immediately. Errors are not caught here: this is a
   * critical, user-initiated write and the store decides how to surface a failure.
   */
  public async revoke(prospectKey: string): Promise<RevokeProspectResponse> {
    const fn = httpsCallable<{ prospectKey: string }, RevokeProspectResponse>(
      this.functions, 'revokeProspect');
    const result = await fn({ prospectKey });
    return result.data;
  }
}
