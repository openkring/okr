import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { SendingCollection, SendingModel } from '@okr/shared-models';
import { sortSendingsNewestFirst } from '@okr/content-pdf-template-util';

/**
 * Live read access to the letters handed to the post provider (spec 1.150 §9). Nothing here writes:
 * `sendings` is written by Cloud Functions only. Both queries are equality-only (no composite index) and
 * sort on the client, as `MailingService.list` does; a `sendings` doc has no meaningful `isArchived`.
 */
@Injectable({ providedIn: 'root' })
export class SendingService {
  private readonly firestoreService = inject(FirestoreService);

  /** All letters of the tenant, newest first. */
  public list(tenantId: string): Observable<SendingModel[]> {
    return this.firestoreService.searchData<SendingModel>(
      SendingCollection, [{ key: 'tenants', operator: 'array-contains', value: tenantId }], 'none'
    ).pipe(map((records) => sortSendingsNewestFirst(records)));
  }

  /** The letters of one Versand (`source == 'mailing.<okey>'`), newest first. */
  public listForMailing(tenantId: string, mailingKey: string): Observable<SendingModel[]> {
    return this.firestoreService.searchData<SendingModel>(
      SendingCollection,
      [
        { key: 'tenants', operator: 'array-contains', value: tenantId },
        { key: 'source', operator: '==', value: `mailing.${mailingKey}` },
      ],
      'none'
    ).pipe(map((records) => sortSendingsNewestFirst(records)));
  }
}
