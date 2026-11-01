import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import type { LanguagesReq, LanguagesRes, TranslateReq, TranslateRes } from '@okr/instruments-translator-util';

/**
 * Wraps the `translator` callable (idea 2.126): translations and the language list from Google Cloud
 * Translation, cached server-side. Needs the network.
 */
@Injectable({ providedIn: 'root' })
export class TranslatorService {
  private readonly env = inject(ENV);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  public async translate(text: string, source: string, target: string): Promise<TranslateRes> {
    const callable = httpsCallable<TranslateReq, TranslateRes>(this.functions, 'translator');
    return (await callable({ op: 'translate', text, source, target })).data;
  }

  public async languages(display: string): Promise<LanguagesRes> {
    const callable = httpsCallable<LanguagesReq, LanguagesRes>(this.functions, 'translator');
    return (await callable({ op: 'languages', display })).data;
  }
}
