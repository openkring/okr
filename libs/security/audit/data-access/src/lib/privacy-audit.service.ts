import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { PrivacyAuditResult } from '@okr/shared-models';

export interface RunPrivacyAuditRequest {
  tenantId: string;
}

/**
 * Thin wrapper around the admin-only `runPrivacyAudit` callable (spec 1.19 Phase 5D).
 *
 * The result is **ephemeral** — nothing is persisted in this slice, so there is no cache
 * and no store here. Each call is a fresh look at the tenant; a stale one rendered as
 * current would be worse than no report at all.
 */
@Injectable({ providedIn: 'root' })
export class PrivacyAuditService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    // Only route to the emulator when it is actually running, not for every dev build —
    // otherwise calls hang against a dead localhost:5001.
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async run(tenantId: string): Promise<PrivacyAuditResult> {
    const callable = httpsCallable<RunPrivacyAuditRequest, PrivacyAuditResult>(
      this.functions, 'runPrivacyAudit');
    const result = await callable({ tenantId });
    return result.data;
  }
}
