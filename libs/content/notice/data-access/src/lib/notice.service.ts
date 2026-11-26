// libs/content/notice/data-access/src/lib/notice.service.ts
import { inject, Injectable } from '@angular/core';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { map, Observable, of } from 'rxjs';

import { ENV, FIRESTORE, activeFirebaseApp } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { NoticeCollection, NoticeModel, NoticeReadModel, NoticeReadsSubcollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { noticesOfTenant } from '@okr/content-notice-util';

/**
 * Mitteilungen (spec 1.145 §10): read-only for clients. `onMailing` writes them, the rules let a
 * recipient read them, and the files open through the `getNoticeAttachment` callable.
 */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly firestore = inject(FIRESTORE);

  private get functions() {
    const fns = getFunctions(activeFirebaseApp(), 'europe-west6');
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

  /**
   * Notes that the reader opened the notice (`notices/{key}/reads/{personKey}`), once: a row that exists
   * is left alone, the rules allow no update. Best effort: a failure only costs the «gelesen» mark.
   */
  public async markRead(notice: Pick<NoticeModel, 'okey' | 'tenants'>, personKey: string): Promise<void> {
    if (!notice.okey || !personKey) return;
    try {
      const ref = doc(this.firestore, NoticeCollection, notice.okey, NoticeReadsSubcollection, personKey);
      if ((await getDoc(ref)).exists()) return;
      const row: NoticeReadModel = { tenants: notice.tenants, readAt: getTodayStr(DateFormat.StoreDateTime) };
      await setDoc(ref, row);
    } catch (err) {
      console.warn('NoticeService.markRead failed', err);
    }
  }

  /** personKey → readAt (StoreDateTime) of every recipient who opened the notice; memberAdmin / privileged only. */
  public async reads(noticeKey: string): Promise<Map<string, string>> {
    const snap = await getDocs(collection(this.firestore, NoticeCollection, noticeKey, NoticeReadsSubcollection));
    return new Map(snap.docs.map((d) => [d.id, (d.data() as Partial<NoticeReadModel>).readAt ?? '']));
  }

  /** A short-lived download URL for one file of a notice. Rejects when the reader may not open it. */
  public async attachmentUrl(noticeKey: string, filename: string): Promise<string> {
    const callable = httpsCallable<{ noticeKey: string; filename: string }, { url: string }>(this.functions, 'getNoticeAttachment');
    const { data } = await callable({ noticeKey, filename });
    return data.url;
  }
}
