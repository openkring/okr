import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { DiarySource } from '@okr/shared-models';

/** One line for the caller's own diary entry of a day — what `recordDiaryLine` needs. */
export interface DiaryLineRequest {
  /** the app's tenant (the one the event happened in) */
  tenantId: string;
  /** which app event this line comes from; the server matches it against the caller's `diaryTargets` */
  source: DiarySource;
  /** DateFormat.StoreDate; must be a real day */
  date: string;
  line: string;
}

export type DiaryLineStatus = 'written' | 'skipped-final' | 'skipped-missing' | 'skipped-no-target';

/** One diary app of the caller, as listed by `listMyDiaryTenants`. */
export interface DiaryTenantInfo {
  tenantId: string;
  title: string;
  logoUrl: string;
}

/** One column of «Tagebuch-Quellen», as listed by `listMyDiaryPullOptions`. */
export interface DiaryPullColumn extends DiaryTenantInfo {
  /** the rows that app offers */
  sources: DiarySource[];
  /** the rows the person allowed there */
  consented: DiarySource[];
  /** the diary app itself: no confirmation needed */
  own: boolean;
}

/** One diary asking the current app, as listed by `listMyDiaryRequests`. */
export interface DiaryRequest extends DiaryTenantInfo {
  from: string;
  to: string;
  requested: DiarySource[];
  consented: DiarySource[];
}

/**
 * Wraps the `recordDiaryLine` callable: appends a line to the `events` of the caller's diary entry
 * in every diary tenant the caller's own `diaryTargets` route this `source` to (spec 1.77).
 * Throws the callable's error, e.g. `permission-denied`.
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

  public async record(request: DiaryLineRequest): Promise<{ status: DiaryLineStatus; written: string[] }> {
    const callable = httpsCallable<DiaryLineRequest, { status: DiaryLineStatus; written?: string[] }>(this.functions, 'recordDiaryLine');
    const { status, written } = (await callable(request)).data;
    return { status, written: written ?? [] };
  }

  /** The caller's diary apps and the sources this app offers (spec 1.77 §5.2). Throws on failure. */
  public async listMyDiaryTenants(): Promise<{ diaries: DiaryTenantInfo[]; sources: DiarySource[] }> {
    const callable = httpsCallable<void, { diaries: DiaryTenantInfo[]; sources: DiarySource[] }>(this.functions, 'listMyDiaryTenants');
    return (await callable()).data;
  }

  /** What this diary can collect from the person's apps, with the consent state (spec 1.77 §12.4). Throws on failure. */
  public async listMyDiaryPullOptions(): Promise<DiaryPullColumn[]> {
    const callable = httpsCallable<void, { columns: DiaryPullColumn[] }>(this.functions, 'listMyDiaryPullOptions');
    return (await callable()).data.columns ?? [];
  }

  /** The diaries asking this app (spec 1.77 §12.4). Throws on failure. */
  public async listMyDiaryRequests(): Promise<DiaryRequest[]> {
    const callable = httpsCallable<void, { requests: DiaryRequest[] }>(this.functions, 'listMyDiaryRequests');
    return (await callable()).data.requests ?? [];
  }

  /** Allows these rows for a diary; [] revokes. `swept` = the recordings a new `tracker` consent added. Throws on failure. */
  public async setDiaryConsent(diaryTenantId: string, sources: DiarySource[]): Promise<{ sources: DiarySource[]; swept: number }> {
    const callable = httpsCallable<{ diaryTenantId: string; sources: DiarySource[] }, { sources: DiarySource[]; swept: number }>(this.functions, 'setDiaryConsent');
    return (await callable({ diaryTenantId, sources })).data;
  }
}
