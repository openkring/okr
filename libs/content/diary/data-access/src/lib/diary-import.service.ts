import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { DiaryImportModel } from '@okr/shared-models';

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

/** What the import callables take. The dry run always starts a new run, so it passes a tenant. */
export interface DiaryImportRequest {
  /** Required when starting a new run; an existing run already carries its tenant. */
  tenantId?: string;
  /** Continues an existing run instead of starting one. */
  runId?: string;
}

/**
 * Thin wrapper around the diary import's two admin-only callables (spec 1.34).
 *
 * Both used to hang off `PrivacyAuditService` because the audit screen was the only admin-only
 * diagnostics surface the app had; they moved here with the AOC diary screen, which is the home
 * their doc comments were waiting for. Nothing is persisted in this slice — the report the dry
 * run returns is also written to `diaryImports` by the function itself.
 */
@Injectable({ providedIn: 'root' })
export class DiaryImportService {
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

  /**
   * Health check for the diary import's Drive credentials (spec 1.34, prerequisite V2).
   * Proves the deployed function still holds a working refresh token. Reads only, writes
   * nothing, returns no file content.
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
   * The call can run for many minutes — the function's own ceiling is 3600s, and a whole-archive
   * pass over ~7'400 files already takes 7-8 of them. The caller must keep a spinner up rather
   * than assume a fast reply.
   */
  public async dryRunDiaryImport(tenantId: string): Promise<DiaryImportModel> {
    // The SDK's own default is 70s (`options.timeout || 70000` in @firebase/functions), and it
    // aborts the CLIENT while the function keeps running — the caller sees a deadline-exceeded
    // for a run that is fine. Match the function's own ceiling instead, so a timeout here means
    // the run really did not finish.
    const callable = httpsCallable<DiaryImportRequest, DiaryImportModel>(
      this.functions, 'dryRunDiaryImport', { timeout: 3_600_000 });
    const result = await callable({ tenantId });
    return result.data;
  }
}
