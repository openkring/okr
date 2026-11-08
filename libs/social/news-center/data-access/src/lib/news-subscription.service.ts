import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { NewsSubscriptionCollection, NewsSubscriptionModel } from '@okr/shared-models';
import { die } from '@okr/shared-util-core';

/** A user's personal channel choices (`news-subscriptions/{uid}`, readable and writable by the owner only). */
@Injectable({ providedIn: 'root' })
export class NewsSubscriptionService {
  private readonly firestoreService = inject(FirestoreService);

  public read(uid: string): Observable<NewsSubscriptionModel | undefined> {
    return this.firestoreService.readModel<NewsSubscriptionModel>(NewsSubscriptionCollection, uid);
  }

  /** The doc id is the Auth uid: the first save creates it, later saves update it. */
  public async save(sub: NewsSubscriptionModel): Promise<void> {
    if (!sub.okey) die('NewsSubscriptionService.save: sub.okey (the uid) is mandatory.');
    const existing = await this.firestoreService.readModelOnce<NewsSubscriptionModel>(NewsSubscriptionCollection, sub.okey);
    if (existing) {
      await this.firestoreService.updateModel(NewsSubscriptionCollection, sub);
    } else {
      await this.firestoreService.createModel(NewsSubscriptionCollection, sub);
    }
  }
}
