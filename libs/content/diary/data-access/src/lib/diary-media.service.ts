import { Injectable, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { DiaryMediaResult } from '@okr/content-diary-util';

/**
 * Wraps the `listDiaryMedia` and `getDiaryMediaImage` callables (spec 1.106 §2.3): the photos and
 * documents of one day folder. Both return image bytes as `data:` URLs — the files are private.
 */
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

  /** One image of the day folder at slider size, as a `data:` URL ('' = Drive has no rendition). */
  public async loadImage(diaryKey: string, fileId: string): Promise<string> {
    const callable = httpsCallable<{ diaryKey: string; fileId: string }, { url: string }>(this.functions, 'getDiaryMediaImage');
    return (await callable({ diaryKey, fileId })).data.url;
  }
}
