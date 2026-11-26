import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { MandateCollection, MandateModel, UserModel } from '@okr/shared-models';
import { isMandateActive, revokePatch } from '@okr/relationship-mandate-util';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

/**
 * Vollmachten (spec 1.180). The Firestore rules prove a read only for a query filtered by `grantorKey ==` me,
 * `granteeKey ==` me, or (proxies) `meetingKey ==` + `kind == 'proxy'`, each together with the tenant
 * `array-contains`; the lists below use exactly those shapes (matching indexes exist). Archived and revoked
 * mandates are therefore returned too — callers decide with `isMandateActive`.
 */
@Injectable({
  providedIn: 'root',
})
export class MandateService {
  private readonly firestoreService = inject(FirestoreService);

  /** The mandates given TO this person (the person acts for the grantors). */
  public listAsGrantee(tenantId: string, personKey: string): Observable<MandateModel[]> {
    if (!tenantId || !personKey) return of([]);
    return this.firestoreService.searchData<MandateModel>(
      MandateCollection,
      [
        { key: 'tenants', operator: 'array-contains', value: tenantId },
        { key: 'granteeKey', operator: '==', value: personKey },
      ],
      'none',
    );
  }

  /** The mandates this person has given. */
  public listAsGrantor(tenantId: string, personKey: string): Observable<MandateModel[]> {
    if (!tenantId || !personKey) return of([]);
    return this.firestoreService.searchData<MandateModel>(
      MandateCollection,
      [
        { key: 'tenants', operator: 'array-contains', value: tenantId },
        { key: 'grantorKey', operator: '==', value: personKey },
      ],
      'none',
    );
  }

  /** The proxies (`kind == 'proxy'`) for one meeting, e.g. for the chair's attendance list. */
  public listProxiesForMeeting(tenantId: string, meetingKey: string): Observable<MandateModel[]> {
    if (!tenantId || !meetingKey) return of([]);
    return this.firestoreService.searchData<MandateModel>(
      MandateCollection,
      [
        { key: 'tenants', operator: 'array-contains', value: tenantId },
        { key: 'meetingKey', operator: '==', value: meetingKey },
        { key: 'kind', operator: '==', value: 'proxy' },
      ],
      'none',
    );
  }

  /**
   * The proxies for one meeting, read from the SERVER (never the cache): the cap check before recording a proxy must
   * see a proxy recorded elsewhere a moment ago. Rejects when the server cannot be reached.
   */
  public async listProxiesForMeetingFromServer(tenantId: string, meetingKey: string): Promise<MandateModel[]> {
    if (!tenantId || !meetingKey) return [];
    return this.firestoreService.getDataFromServerStrict<MandateModel>(MandateCollection, [
      { key: 'tenants', operator: 'array-contains', value: tenantId },
      { key: 'meetingKey', operator: '==', value: meetingKey },
      { key: 'kind', operator: '==', value: 'proxy' },
    ]);
  }

  /**
   * Stores a new mandate. The caller stamps `createdByKey` (the rules require it to be the caller's personKey) and
   * leaves `revokedAt` / `revokedByKey` empty. Returns the okey, or undefined if the write failed.
   */
  public create(mandate: MandateModel, currentUser: UserModel): Promise<string | undefined> {
    return this.firestoreService.createModel<MandateModel>(MandateCollection, mandate, undefined, undefined, currentUser);
  }

  /**
   * Revokes a mandate. Writes ONLY `revokedAt` + `revokedByKey` (field update): the rules allow nothing else on a
   * revocation, and a full-model update would be denied. `byKey` must be the caller's personKey.
   * Returns false when the write failed (`updateFields` catches the error and returns undefined).
   */
  public async revoke(mandate: MandateModel, byKey: string): Promise<boolean> {
    const key = await this.firestoreService.updateFields(MandateCollection, mandate.okey, revokePatch(byKey, getTodayStr(DateFormat.StoreDateTime)));
    return key !== undefined;
  }

  /**
   * Re-reads one mandate from the SERVER (never the local cache, so a revocation made elsewhere is seen) and returns
   * it only when it is active today and belongs to the tenant. Rejects if the server cannot be reached.
   */
  public async readActive(okey: string, tenantId: string): Promise<MandateModel | undefined> {
    if (!okey || !tenantId) return undefined;
    const data = await this.firestoreService.readObjectStrict<MandateModel>(`${MandateCollection}/${okey}`);
    if (!data) return undefined;
    const mandate = { ...data, okey } as MandateModel;
    if (!(mandate.tenants ?? []).includes(tenantId)) return undefined;
    return isMandateActive(mandate, getTodayStr(DateFormat.StoreDate)) ? mandate : undefined;
  }
}
