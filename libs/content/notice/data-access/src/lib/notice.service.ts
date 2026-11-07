// libs/content/notice/data-access/src/lib/notice.service.ts
import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { NoticeCollection, NoticeModel } from '@okr/shared-models';
import { noticesOfTenant } from '@okr/content-notice-util';

/**
 * Mitteilungen (spec 1.145 §10): read-only for clients. `onMailing` writes them, the rules let a
 * recipient read them, and the files open through the `getNoticeAttachment` callable.
 */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  private get functions() {
    const fns = getFunctions(getApp(), 'europe-west6');
    if (this.env.useEmulators) {
      try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already connected */ }
    }
    return fns;
  }

  /** The reader's notices in this tenant, newest first. One array filter only; the rest is client-side. */
  public listMine(personKey: string | undefined, maxItems?: number): Observable<NoticeModel[]> {
    if (!personKey) return of([]);
    return this.firestoreService
      .searchData<NoticeModel>(NoticeCollection, [{ key: 'recipients', operator: 'array-contains', value: personKey }], 'sentAt', 'desc')
      .pipe(map((list) => noticesOfTenant(list, this.env.tenantId, maxItems)));
  }

  public read(noticeKey: string | undefined): Observable<NoticeModel | undefined> {
    return this.firestoreService.readModel<NoticeModel>(NoticeCollection, noticeKey);
  }

  /** A short-lived download URL for one file of a notice. Rejects when the reader may not open it. */
  public async attachmentUrl(noticeKey: string, filename: string): Promise<string> {
    const callable = httpsCallable<{ noticeKey: string; filename: string }, { url: string }>(this.functions, 'getNoticeAttachment');
    const { data } = await callable({ noticeKey, filename });
    return data.url;
  }
}
