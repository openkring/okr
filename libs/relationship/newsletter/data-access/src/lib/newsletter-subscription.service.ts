import { inject, Injectable } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { FirestoreService } from '@okr/shared-data-access';
import { confirm, showToast } from '@okr/shared-util-angular';
import { DbQuery, NewsletterSubscriptionCollection, NewsletterSubscriptionModel } from '@okr/shared-models';
import { ImportRow, isActiveSubscription } from '@okr/relationship-newsletter-util';

/** The outcome of an import: how many rows ended where. */
export interface ImportSummary {
  imported: number;
  alreadySubscribed: number;
  matchedExisting: number;
  /** subscribed to one of several persons with the same email and name; the member admins got a duplicates task */
  ambiguous: number;
  invalid: number;
}

/** The texts of the subscriber's «abbestellen» dialog and its toasts, already translated. */
export interface LeaveTexts {
  confirm: string;
  ok: string;
  cancel: string;
  done: string;
  error: string;
}

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
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
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
   * Whether the newsletter still has an active subscriber, read once from the server. A failed read answers
   * true: the caller uses it to decide whether the group may be deleted, and doubt keeps the group.
   */
  public async hasActiveSubscribers(tenantId: string, groupKey: string): Promise<boolean> {
    try {
      const subscriptions = await this.firestoreService.getDataOnceStrict<NewsletterSubscriptionModel>(
        NewsletterSubscriptionCollection, this.query(tenantId, 'groupKey', groupKey), 'none');
      return subscriptions.some((s) => isActiveSubscription(s));
    } catch (err) {
      console.warn('NewsletterSubscriptionService.hasActiveSubscribers: read failed', err);
      return true;
    }
  }

  /**
   * Ends a subscription through the `leaveNewsletter` callable. The server allows the subscriber,
   * a member admin, a privileged user or an admin of the newsletter. Throws on failure.
   */
  public async leave(tenantId: string, subscriptionKey: string): Promise<void> {
    const fn = httpsCallable<{ tenantId: string; subscriptionKey: string }, { ok: true }>(this.functions, 'leaveNewsletter');
    await fn({ tenantId, subscriptionKey });
  }

  /** Imports parsed Mailchimp rows into a newsletter (`importNewsletterSubscribers`); answers five counts, never an address. */
  public async importRows(tenantId: string, groupKey: string, rows: ImportRow[]): Promise<ImportSummary> {
    const fn = httpsCallable<{ tenantId: string; groupKey: string; rows: ImportRow[] }, ImportSummary>(this.functions, 'importNewsletterSubscribers');
    return (await fn({ tenantId, groupKey, rows })).data;
  }

  /**
   * The subscriber's own «abbestellen»: asks first (Abbestellen / Abbrechen), ends the subscription through
   * `leave`, and answers with a toast. Resolves true only when the subscription ended.
   */
  public async leaveWithConfirm(tenantId: string, subscriptionKey: string, texts: LeaveTexts): Promise<boolean> {
    const confirmed = await confirm(this.alertController, texts.confirm, texts.ok, texts.cancel, true);
    if (!confirmed) return false;
    try {
      await this.leave(tenantId, subscriptionKey);
      await showToast(this.toastController, texts.done);
      return true;
    } catch (err) {
      console.error('NewsletterSubscriptionService.leaveWithConfirm: leaveNewsletter failed', err);
      await showToast(this.toastController, texts.error);
      return false;
    }
  }

  private query(tenantId: string, key: 'groupKey' | 'personKey', value: string): DbQuery[] {
    return [
      { key: 'tenants', operator: 'array-contains', value: tenantId },
      { key, operator: '==', value },
    ];
  }
}
