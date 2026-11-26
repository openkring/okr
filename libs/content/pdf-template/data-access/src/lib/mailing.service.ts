// libs/content/pdf-template/data-access/src/lib/mailing.service.ts
import { inject, Injectable } from '@angular/core';
import { collection, getDocs, limit, orderBy, query, where, type Query } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';
import { catchError, map, Observable, of } from 'rxjs';

import { FIRESTORE } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { CalEventCollection, CalEventModel, NoticeCollection, NoticeReadModel, NoticeReadsSubcollection } from '@okr/shared-models';
import { MailingView, sortMailingsNewestFirst } from '@okr/content-pdf-template-util';

/** One doc per Versand (spec 1.145 §10), written only by `sendMailing` / `onMailing`. */
export const MailingCollection = 'mailings';
/** «Frühere E-Mail kopieren» reads at most this many of the tenant's newest Versände. */
export const RECENT_MAILINGS_MAX = 100;

/**
 * Read access to the sent Versände, for the overview. Nothing here writes: the rules refuse every
 * client write to `mailings`, and the counts and states belong to `onMailing`.
 */
@Injectable({ providedIn: 'root' })
export class MailingService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly firestore = inject(FIRESTORE);

  /**
   * The tenant's Versände, newest first. A `mailings` doc has no `isArchived`, so the usual system
   * query (which asks for `isArchived == false`) would match none; the sort runs on the client so the
   * query needs no composite index. A tenant sends a few dozen a year.
   */
  public list(tenantId: string): Observable<MailingView[]> {
    return this.firestoreService.searchData<MailingView>(
      MailingCollection, [{ key: 'tenants', operator: 'array-contains', value: tenantId }], 'none'
    ).pipe(map((mailings) => sortMailingsNewestFirst(mailings)));
  }

  /**
   * The tenant's newest Versände, once (not live), at most `max`: what «Frühere E-Mail kopieren» offers to a member admin or privileged
   * user (spec 1.176 §8.5). Ordered by `createdAt` on the server; until the composite index (tenants, createdAt desc) is deployed the
   * query fails with `failed-precondition`, and the unordered query is sorted and cut here.
   */
  public async recent(tenantId: string, max = RECENT_MAILINGS_MAX): Promise<MailingView[]> {
    const mailings = collection(this.firestore, MailingCollection);
    const read = async (q: Query) => (await getDocs(q)).docs.map((d) => ({ ...d.data(), okey: d.id }) as MailingView);
    try {
      return await read(query(mailings, where('tenants', 'array-contains', tenantId), orderBy('createdAt', 'desc'), limit(max)));
    } catch (err) {
      if ((err as { code?: unknown } | undefined)?.code !== 'failed-precondition') throw err;
      console.warn('MailingService.recent: the index is missing, reading unordered', err);
      return sortMailingsNewestFirst(await read(query(mailings, where('tenants', 'array-contains', tenantId)))).slice(0, max);
    }
  }

  public read(key: string | undefined): Observable<MailingView | undefined> {
    return this.firestoreService.readObject<MailingView>(MailingCollection, key).pipe(
      map((mailing) => (mailing && key ? { ...mailing, okey: key } : undefined))
    );
  }

  /** An event the Versand asks about; undefined once it was deleted. */
  public readEvent(key: string): Observable<CalEventModel | undefined> {
    return this.firestoreService.readModel<CalEventModel>(CalEventCollection, key);
  }

  /**
   * Who opened the Versand's Mitteilung, live: personKey → readAt (StoreDateTime). A denied or failed
   * read comes back empty (nobody shown as having read it).
   */
  public noticeReads(noticeKey: string): Observable<Map<string, string>> {
    return collectionData(collection(this.firestore, NoticeCollection, noticeKey, NoticeReadsSubcollection), { idField: 'personKey' }).pipe(
      map((rows) => new Map((rows as (Partial<NoticeReadModel> & { personKey: string })[]).map((r) => [r.personKey, r.readAt ?? '']))),
      catchError((err) => {
        console.warn('MailingService.noticeReads failed', err);
        return of(new Map<string, string>());
      }),
    );
  }
}
