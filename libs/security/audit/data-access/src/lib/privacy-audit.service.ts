import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { DiaryImportModel, PrivacyAuditResult } from '@okr/shared-models';

export interface RunPrivacyAuditRequest {
  tenantId: string;
}

/**
 * What `rebuildAddressDirectory` reports back.
 *
 * `crossTenantAddresses`/`parentsAffected` are **not** a migration delta that falls to 0
 * after the first run: they are recomputed from the address data every time and stay at
 * whatever the data holds, because the filter excludes those addresses from the projection
 * rather than deleting them. They drop only when the addresses themselves go or are
 * re-tagged. See `writeAddressDirectory`.
 */
export interface RebuildDirectoryResult {
  persons: number;
  orgs: number;
  crossTenantAddresses: number;
  parentsAffected: number;
}

/**
 * What `checkDriveAccess` reports back — a read-only proof that the deployed function can reach
 * the diary archive in Drive. No file content crosses the wire: the archive is personal data.
 */
export interface DriveAccessResult {
  account: string;
  quotaLimit: string;
  quotaUsage: string;
  firstPageFiles: number;
  hasMorePages: boolean;
}

/**
 * What the diary import run reports back. The dry run does the full read/parse/resolve/weather
 * pass and writes nothing — `written` stays 0 and `isDryRun` is true.
 */
export interface DiaryImportRequest {
  /** Required when starting a new run; an existing run already carries its tenant. */
  tenantId?: string;
  /** Continues an existing run instead of starting one. */
  runId?: string;
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

  /**
   * Health check for the diary import's Drive credentials (spec 1.34, prerequisite V2).
   *
   * It sits on the audit screen because that is the only admin-only diagnostics surface the app
   * has today — the diary domain has a `util` lib and no page yet. Move it to the diary admin
   * screen once one exists; nothing else calls it.
   */
  public async checkDriveAccess(): Promise<DriveAccessResult> {
    const callable = httpsCallable<Record<string, never>, DriveAccessResult>(
      this.functions, 'checkDriveAccess');
    const result = await callable({});
    return result.data;
  }

  /**
   * Starts a diary import **dry run**: the deployed function reads the archive from Drive,
   * parses every file, resolves people and locations and compares the archived weather line
   * against the API — and writes no `diaries` document. Only the run's own report row is
   * persisted, so the call is safe to repeat.
   *
   * Sits here for the same reason as `checkDriveAccess`: the audit screen is the only
   * admin-only diagnostics surface the app has, and the diary domain still has no page.
   * Move both once one exists.
   *
   * The call can run for minutes — the function's own ceiling is 540s. The caller must keep
   * a spinner up rather than assume a fast reply.
   */
  public async dryRunDiaryImport(tenantId: string): Promise<DiaryImportModel> {
    // The SDK's own default is 70s (`options.timeout || 70000` in @firebase/functions), and it
    // aborts the CLIENT while the function keeps running — the caller sees a deadline-exceeded
    // for a run that is fine. Match the function's own 540s ceiling instead, so a timeout here
    // means the run really did not finish.
    const callable = httpsCallable<DiaryImportRequest, DiaryImportModel>(
      this.functions, 'dryRunDiaryImport', { timeout: 540_000 });
    const result = await callable({ tenantId });
    return result.data;
  }
}
