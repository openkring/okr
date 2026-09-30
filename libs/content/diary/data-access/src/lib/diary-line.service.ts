import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';

/** One line for the caller's own diary entry of a day — what `recordDiaryLine` needs. */
export interface DiaryLineRequest {
  /** the app's tenant; its app-config names the diary tenant (`diaryTenantId`) */
  tenantId: string;
  /** DateFormat.StoreDate; must be a real day */
  date: string;
  line: string;
}

export type DiaryLineStatus = 'written' | 'skipped-final' | 'skipped-missing';

/**
 * Wraps the `recordDiaryLine` callable: appends a line to the `events` of the caller's diary entry
 * in the tenant named by `app-config.diaryTenantId` (spec 1.67 Jasstafel). Throws the callable's
 * error — `failed-precondition` (no diary tenant) or `permission-denied` (not a member of it).
 */
@Injectable({ providedIn: 'root' })
export class DiaryLineService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async record(request: DiaryLineRequest): Promise<DiaryLineStatus> {
    const callable = httpsCallable<DiaryLineRequest, { status: DiaryLineStatus }>(this.functions, 'recordDiaryLine');
    return (await callable(request)).data.status;
  }
}
