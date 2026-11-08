import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { NewsChannelRequestCollection, NewsChannelRequestModel } from '@okr/shared-models';
import { DateFormat, die, getTodayStr } from '@okr/shared-util-core';

/** Users suggest channels (`news-channel-requests`); an admin accepts or rejects them. */
@Injectable({ providedIn: 'root' })
export class NewsChannelRequestService {
  private readonly firestoreService = inject(FirestoreService);

  /** Admin: the open requests of the tenant, newest first. */
  public listOpen(tenantId: string): Observable<NewsChannelRequestModel[]> {
    return this.firestoreService.searchData<NewsChannelRequestModel>(
      NewsChannelRequestCollection,
      [
        { key: 'tenants', operator: 'array-contains', value: tenantId },
        { key: 'status', operator: '==', value: 'open' },
      ],
      'createdAt',
      'desc'
    );
  }

  /** The requester's own requests, newest first. The rules require both filters. */
  public listMine(tenantId: string, uid: string): Observable<NewsChannelRequestModel[]> {
    return this.firestoreService.searchData<NewsChannelRequestModel>(
      NewsChannelRequestCollection,
      [
        { key: 'tenants', operator: 'array-contains', value: tenantId },
        { key: 'requesterUid', operator: '==', value: uid },
      ],
      'createdAt',
      'desc'
    );
  }

  public create(req: NewsChannelRequestModel): Promise<string | undefined> {
    return this.firestoreService.createModel(NewsChannelRequestCollection, req);
  }

  /** Writes only `status`, `decidedAt` and `channelKey`, as the rules allow. */
  public async decide(req: NewsChannelRequestModel, status: 'accepted' | 'rejected', channelKey = ''): Promise<void> {
    if (!req.okey) die('NewsChannelRequestService.decide: req.okey is mandatory.');
    await this.firestoreService.updateFields(NewsChannelRequestCollection, req.okey, {
      status,
      decidedAt: getTodayStr(DateFormat.StoreDateTime),
      channelKey,
    });
  }
}
