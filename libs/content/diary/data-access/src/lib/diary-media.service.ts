import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { DiaryMediaResult } from '@okr/content-diary-util';

/** Wraps the `listDiaryMedia` callable (spec 1.106 §2.3): the photos and documents of one day folder. */
@Injectable({ providedIn: 'root' })
export class DiaryMediaService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async list(diaryKey: string): Promise<DiaryMediaResult> {
    const callable = httpsCallable<{ diaryKey: string }, DiaryMediaResult>(this.functions, 'listDiaryMedia');
    return (await callable({ diaryKey })).data;
  }
}
