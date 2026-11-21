import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonAccordion, IonButton, IonItem, IonLabel, IonList } from '@ionic/angular';
import { catchError, of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { NewsletterSubscriptionModel } from '@okr/shared-models';
import { PrettyDatePipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';
import { NewsletterSubscriptionService } from '@okr/relationship-newsletter-data-access';
import { activeSubscribers, NEWSLETTER_I18N_KEYS, NewsletterI18n } from '@okr/relationship-newsletter-util';

/**
 * The profile accordion «Newsletter» (spec 1.169 §5.9): the newsletters the current user is subscribed
 * to, each with its since-date and an «Abbestellen» button. Hidden entirely (no empty state) until the user holds
 * at least one active subscription, so a member who never subscribed sees no newsletter section at all.
 */
@Component({
  selector: 'okr-my-newsletters',
  standalone: true,
  imports: [PrettyDatePipe, IonAccordion, IonItem, IonLabel, IonList, IonButton],
  template: `
    @if (subscriptions().length > 0) {
      <ion-accordion value="newsletters">
        <ion-item slot="header" color="light">
          <ion-label>{{ i18n.my_title() }}</ion-label>
        </ion-item>
        <div slot="content">
          <ion-list lines="inset">
            @for (subscription of subscriptions(); track subscription.okey) {
              <ion-item>
                <ion-label>
                  <h2>{{ subscription.groupName }}</h2>
                  @if (subscription.dateOfEntry) {
                    <p>{{ i18n.since() }} {{ subscription.dateOfEntry | prettyDate }}</p>
                  }
                </ion-label>
                <ion-button slot="end" fill="outline" size="small" [disabled]="busy()" (click)="leave(subscription)">
                  {{ i18n.leave() }}
                </ion-button>
              </ion-item>
            }
          </ion-list>
        </div>
      </ion-accordion>
    }
  `,
})
export class MyNewsletters {
  private readonly appStore = inject(AppStore);
  private readonly subscriptionService = inject(NewsletterSubscriptionService);
  protected readonly i18n = inject(I18nService).translateAll(NEWSLETTER_I18N_KEYS) as NewsletterI18n;

  protected readonly busy = signal(false);
  protected readonly personKey = computed(() => this.appStore.currentUser()?.personKey ?? '');

  private readonly resource = rxResource<NewsletterSubscriptionModel[], { tenantId: string; personKey: string }>({
    params: () => ({ tenantId: this.appStore.tenantId(), personKey: this.personKey() }),
    stream: ({ params }) => params.personKey === ''
      ? of([])
      : this.subscriptionService.listMine(params.tenantId, params.personKey).pipe(catchError(() => of([]))),
  });
  protected readonly subscriptions = computed(() => this.resource.hasValue() ? activeSubscribers(this.resource.value()) : []);

  protected async leave(subscription: NewsletterSubscriptionModel): Promise<void> {
    this.busy.set(true);
    try {
      await this.subscriptionService.leaveWithConfirm(this.appStore.tenantId(), subscription.okey, {
        confirm: fill(this.i18n.leave_confirm(), { name: subscription.groupName }),
        ok: this.i18n.leave(),
        cancel: this.i18n.cancel(),
        done: this.i18n.leave_done(),
        error: this.i18n.leave_error(),
      });
    } finally {
      this.busy.set(false);
    }
  }
}
