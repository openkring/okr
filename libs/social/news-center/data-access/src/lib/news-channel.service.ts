import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { NewsChannelCollection, NewsChannelModel } from '@okr/shared-models';
import { die, getDeletePatch } from '@okr/shared-util-core';

/** The catalogue of NewsCenter channels of a tenant (`news-channels`). */
@Injectable({ providedIn: 'root' })
export class NewsChannelService {
  private readonly firestoreService = inject(FirestoreService);

  /**
   * Non-archived channels of the tenant, ordered by `order`. The query is shaped to what the
   * existing index serves (tenants array-contains); the archive flag and the order are applied here.
   */
  public list(tenantId: string): Observable<NewsChannelModel[]> {
    return this.firestoreService
      .searchData<NewsChannelModel>(NewsChannelCollection, [{ key: 'tenants', operator: 'array-contains', value: tenantId }], 'none')
      .pipe(map((channels) => channels.filter((c) => !c.isArchived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))));
  }

  /** The webcams an org hosts (design 2026-11-09 §5.4): filtered from `list`, no extra index. */
  public listByOrg(tenantId: string, orgKey: string): Observable<NewsChannelModel[]> {
    if (!orgKey) return of([]);
    return this.list(tenantId).pipe(map((channels) => channels.filter((c) => c.segment === 'webcam' && c.orgKey === orgKey)));
  }

  public create(channel: NewsChannelModel): Promise<string | undefined> {
    return this.firestoreService.createModel(NewsChannelCollection, channel);
  }

  public update(channel: NewsChannelModel): Promise<string | undefined> {
    return this.firestoreService.updateModel(NewsChannelCollection, channel);
  }

  /** A channel is never deleted: it is archived (deleting-models skill). */
  public async archive(channel: NewsChannelModel): Promise<void> {
    if (!channel.okey) die('NewsChannelService.archive: channel.okey is mandatory.');
    await this.firestoreService.updateFields(NewsChannelCollection, channel.okey, { isArchived: true });
  }
}
