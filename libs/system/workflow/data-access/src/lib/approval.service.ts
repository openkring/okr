import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { ApprovalCollection, ApprovalModel, ApprovalState } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

/**
 * Approvals (spec 2026-08-15-approval-workflow-spec.md §3).
 *
 * READ-ONLY over Firestore: `approvals` is CF-write-only, so there is no create/update/
 * delete here. An approval is created by the `requestApproval` workflow action and
 * changed only through the `decideApproval` callable, which checks that the caller really
 * is the snapshotted approver. A decision a client could write directly is not an audit
 * trail.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'index', sortOrder: 'asc' | 'desc' = 'asc'): Observable<ApprovalModel[]> {
    return this.firestoreService.searchData<ApprovalModel>(ApprovalCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  public read(key: string): Observable<ApprovalModel | undefined> {
    return this.firestoreService.readModel<ApprovalModel>(ApprovalCollection, key);
  }

  /*-------------------------- DECISION --------------------------------*/
  /**
   * Record the decision. Errors are NOT swallowed — the caller shows them, because a
   * silently failed approval looks exactly like a successful one to the approver.
   * @param approvalKey the approval's okey
   * @param decision approve | reject | withdraw
   * @param note free text; required by the CF when rejecting
   */
  public async decide(approvalKey: string, decision: 'approve' | 'reject' | 'withdraw', note = ''): Promise<ApprovalState> {
    const callable = httpsCallable<{ approvalKey: string; decision: string; note: string }, { state: ApprovalState }>(
      this.functions, 'decideApproval',
    );
    const result = await callable({ approvalKey, decision, note });
    return result.data.state;
  }
}
