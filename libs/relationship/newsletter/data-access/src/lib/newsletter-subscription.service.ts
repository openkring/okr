import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { FirestoreService } from '@okr/shared-data-access';
import { DbQuery, NewsletterSubscriptionCollection, NewsletterSubscriptionModel } from '@okr/shared-models';

/**
 * Reads newsletter subscriptions (spec 1.169 §5.8). The client never writes one: subscribe, confirm,
 * unsubscribe and import all run in Cloud Functions.
 *
 * Every query carries `tenants array-contains <tenantId>` plus `groupKey ==` or `personKey ==`: the
 * read rule tests the caller against `resource.data.groupKey` / `personKey`, and Firestore refuses a
 * list query that could return a document the rule would deny. No `orderBy`, so no composite index
 * is needed; the caller sorts.
 */
@Injectable({ providedIn: 'root' })
export class NewsletterSubscriptionService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  /** All subscriptions of a newsletter, ended and archived ones included (filter with `isActiveSubscription`). */
  public listByGroup(tenantId: string, groupKey: string): Observable<NewsletterSubscriptionModel[]> {
    return this.firestoreService.searchData<NewsletterSubscriptionModel>(
      NewsletterSubscriptionCollection, this.query(tenantId, 'groupKey', groupKey), 'none');
  }

  /** The subscriptions of one person (the profile's «meine Newsletter»). */
  public listMine(tenantId: string, personKey: string): Observable<NewsletterSubscriptionModel[]> {
    return this.firestoreService.searchData<NewsletterSubscriptionModel>(
      NewsletterSubscriptionCollection, this.query(tenantId, 'personKey', personKey), 'none');
  }

  /**
   * Ends a subscription through the `leaveNewsletter` callable. The server allows the subscriber,
   * a member admin, a privileged user or an admin of the newsletter. Throws on failure.
   */
  public async leave(tenantId: string, subscriptionKey: string): Promise<void> {
    const fn = httpsCallable<{ tenantId: string; subscriptionKey: string }, { ok: true }>(this.functions, 'leaveNewsletter');
    await fn({ tenantId, subscriptionKey });
  }

  private query(tenantId: string, key: 'groupKey' | 'personKey', value: string): DbQuery[] {
    return [
      { key: 'tenants', operator: 'array-contains', value: tenantId },
      { key, operator: '==', value },
    ];
  }
}
