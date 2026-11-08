// libs/content/pdf-template/data-access/src/lib/mailing.service.ts
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { CalEventCollection, CalEventModel } from '@okr/shared-models';
import { MailingView, sortMailingsNewestFirst } from '@okr/content-pdf-template-util';

/** One doc per Versand (spec 1.145 §10), written only by `sendMailing` / `onMailing`. */
export const MailingCollection = 'mailings';

/**
 * Read access to the sent Versände, for the overview. Nothing here writes: the rules refuse every
 * client write to `mailings`, and the counts and states belong to `onMailing`.
 */
@Injectable({ providedIn: 'root' })
export class MailingService {
  private readonly firestoreService = inject(FirestoreService);

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

  public read(key: string | undefined): Observable<MailingView | undefined> {
    return this.firestoreService.readObject<MailingView>(MailingCollection, key).pipe(
      map((mailing) => (mailing && key ? { ...mailing, okey: key } : undefined))
    );
  }

  /** An event the Versand asks about; undefined once it was deleted. */
  public readEvent(key: string): Observable<CalEventModel | undefined> {
    return this.firestoreService.readModel<CalEventModel>(CalEventCollection, key);
  }
}
