import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { FirestoreService } from '@okr/shared-data-access';
import { HouseholdCollection, HouseholdModel } from '@okr/shared-models';
import { die } from '@okr/shared-util-core';

type SaveHouseholdRequest = { tenantId: string; household: HouseholdModel; archive?: boolean };

/** Whether a raw household doc is live in the tenant (legacy fields may be missing). */
function isLiveIn(h: HouseholdModel, tenantId: string): boolean {
  return (h.tenants ?? []).includes(tenantId) && !h.isArchived;
}

/**
 * Haushalte (spec 1.168). Reads go straight to Firestore; the client never writes a household — every write runs
 * through the `saveHousehold` callable, which checks «one household per person and tenant» and «payer and contact are
 * members» across documents.
 *
 * Both lists use a single filter only (single-field index, no composite index needed); tenant, archive state and
 * membership are filtered here.
 */
@Injectable({
  providedIn: 'root',
})
export class HouseholdService {
  private readonly firestoreService = inject(FirestoreService);

  /**
   * The live households of a person in this tenant. The rules let a member read their household in ANY tenant
   * (`memberKeys array-contains` cannot also prove the tenant), so other tenants' and archived docs are dropped here.
   * Only the person themself can run this query; an admin looking at another person uses `listForTenant`.
   */
  public listForPerson(tenantId: string, personKey: string): Observable<HouseholdModel[]> {
    if (!tenantId || !personKey) return of([]);
    return this.firestoreService
      .searchData<HouseholdModel>(HouseholdCollection, [{ key: 'memberKeys', operator: 'array-contains', value: personKey }], 'none')
      .pipe(map((list) => list.filter((h) => isLiveIn(h, tenantId))));
  }

  /**
   * The live households of the tenant (memberAdmin / privileged: the rules prove the tenant from this filter).
   * With `personKey`, only the household(s) that person belongs to.
   */
  public listForTenant(tenantId: string, personKey?: string): Observable<HouseholdModel[]> {
    if (!tenantId) return of([]);
    return this.firestoreService
      .searchData<HouseholdModel>(HouseholdCollection, [{ key: 'tenants', operator: 'array-contains', value: tenantId }], 'none')
      .pipe(map((list) => list.filter((h) => isLiveIn(h, tenantId) && (!personKey || (h.memberKeys ?? []).includes(personKey)))));
  }

  /**
   * Creates or updates a household through the `saveHousehold` callable; `archive` dissolves it. Returns the okey.
   * Errors are not caught: the caller maps them with `householdErrorKey` to a message.
   */
  public async save(tenantId: string, household: HouseholdModel, archive?: boolean): Promise<string> {
    if (!tenantId) die('HouseholdService.save: tenantId is mandatory.');
    const request: SaveHouseholdRequest = { tenantId, household, ...(archive ? { archive: true } : {}) };
    const result = await this.callFunction<SaveHouseholdRequest, { okey: string }>('saveHousehold', request);
    return result.okey;
  }

  /** The `firebase/functions` import is dynamic (as in `TrainerBillingService`): SSR-safe and out of the eager bundle. */
  private async callFunction<Req, Res>(name: string, data: Req): Promise<Res> {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const fn = httpsCallable<Req, Res>(getFunctions(undefined, 'europe-west6'), name);
    return (await fn(data)).data;
  }
}
