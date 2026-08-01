import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { PrivacyAuditResult } from '@okr/shared-models';

export interface RunPrivacyAuditRequest {
  tenantId: string;
}

/** What `rebuildAddressDirectory` reports back. Both cross-tenant counts are 0 once D-L1 has run. */
export interface RebuildDirectoryResult {
  persons: number;
  orgs: number;
  crossTenantAddresses: number;
  parentsAffected: number;
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

  /**
   * Rebuilds the whole `address-directory` projection — the remedy check 3 prescribes.
   *
   * It lives next to the audit rather than in the address domain because the audit screen is
   * where an admin is told to run it, and it is the only caller. Takes no arguments and is
   * **not tenant-scoped**: the callable walks every person and org (spec 1.19 Phase 4). It is
   * idempotent, so a second run costs time and nothing else.
   */
  public async rebuildAddressDirectory(): Promise<RebuildDirectoryResult> {
    const callable = httpsCallable<Record<string, never>, RebuildDirectoryResult>(
      this.functions, 'rebuildAddressDirectory');
    const result = await callable({});
    return result.data;
  }
}
