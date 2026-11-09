// libs/finance/collection/feature/src/lib/billing.page.ts
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  IonButton, IonButtons, IonContent, IonItem, IonItemDivider, IonItemGroup, IonLabel, IonList, IonNote, IonSpinner,
} from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { fill, prettyFormatDateTime } from '@okr/shared-util-core';
import { formatChfAmount, formatSignedChf, stripeReturnNotice } from '@okr/finance-collection-util';

import { BillingStore, CreditEntryRow } from './billing.store';

/**
 * `/billing` (admin): «Zahlung & Guthaben». Stripe returns here with `?stripe=done|cancel` after saving a method;
 * the notice for `done` turns into «gespeichert» as soon as the webhook has written the method (live listener).
 */
@Component({
  selector: 'okr-billing-page',
  standalone: true,
  providers: [BillingStore],
  imports: [
    Header,
    IonContent, IonList, IonItemGroup, IonItemDivider, IonItem, IonLabel, IonNote, IonButtons, IonButton, IonSpinner,
  ],
  styles: [`
    .amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .negative { color: var(--ion-color-danger); }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.billing_title() }" />
    <ion-content>
      @if (store.isLoading()) {
        <ion-item lines="none">
          <ion-spinner slot="start" name="crescent" />
          <ion-label>{{ i18n.loading() }}</ion-label>
        </ion-item>
      } @else {
        <ion-list>
          @if (methodNotice(); as notice) {
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">{{ notice }}</ion-label>
            </ion-item>
          }

          <ion-item-group>
            <ion-item-divider><ion-label>{{ i18n.method_title() }}</ion-label></ion-item-divider>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                @if (store.hasPaymentMethod()) {
                  {{ store.paymentMethodLabel() }}
                } @else {
                  <ion-note>{{ i18n.method_none() }}</ion-note>
                }
              </ion-label>
              <ion-buttons slot="end">
                <ion-button fill="outline" [disabled]="store.busy()" (click)="store.changePaymentMethod()">
                  {{ store.hasPaymentMethod() ? i18n.method_change() : i18n.method_add() }}
                </ion-button>
                @if (store.hasPaymentMethod()) {
                  <ion-button fill="clear" color="danger" [disabled]="store.busy()" (click)="store.removePaymentMethod()">
                    {{ i18n.method_remove() }}
                  </ion-button>
                }
              </ion-buttons>
            </ion-item>
          </ion-item-group>

          <ion-item-group>
            <ion-item-divider><ion-label>{{ i18n.credit_title() }}</ion-label></ion-item-divider>
            <ion-item lines="none">
              <ion-label>{{ i18n.credit_balance() }}</ion-label>
              <ion-label slot="end" class="amount">CHF {{ balance() }}</ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-button fill="outline" [disabled]="store.busy()" (click)="store.topUp()">{{ i18n.topup_button() }}</ion-button>
            </ion-item>
            <ion-item button [detail]="true" [disabled]="store.busy()" (click)="store.editAutoTopUp()">
              <ion-label>{{ i18n.autotopup_title() }}</ion-label>
              <ion-note slot="end" class="ion-text-wrap">{{ autoTopUpText() }}</ion-note>
            </ion-item>
          </ion-item-group>

          <ion-item-group>
            <ion-item-divider><ion-label>{{ i18n.entries_title() }}</ion-label></ion-item-divider>
            @for (entry of store.entries(); track entry.okey) {
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h3>{{ entryText(entry) }}</h3>
                  <p>{{ entryDate(entry) }}</p>
                </ion-label>
                <ion-label slot="end" class="amount" [class.negative]="entry.amount < 0">{{ signed(entry.amount) }}</ion-label>
              </ion-item>
            } @empty {
              <ion-item lines="none"><ion-note>{{ i18n.entries_empty() }}</ion-note></ion-item>
            }
          </ion-item-group>
        </ion-list>
      }
    </ion-content>
  `,
})
export class BillingPage {
  protected readonly store = inject(BillingStore);
  protected readonly i18n = this.store.i18n;

  /** `?stripe=done|cancel` from the Stripe redirect; undefined otherwise (route input binding). */
  public readonly stripe = input<string | undefined>(undefined);

  protected readonly balance = computed(() => formatChfAmount(this.store.balance()));

  /**
   * The saved method's id on the first subscription emission after landing ('' = none, undefined = not read yet).
   * A doc that still holds the old method then reads «wird gespeichert» until the webhook writes the new one.
   */
  private readonly baselineId = signal<string | undefined>(undefined);
  /** landing time: a method whose consent is younger than 10 minutes counts as just saved */
  private readonly landedAt = new Date();

  constructor() {
    effect(() => {
      const status = this.store.subscriptionResource.status();
      if (status !== 'resolved' && status !== 'local') return;
      const id = this.store.paymentMethod()?.stripePaymentMethodId ?? '';
      untracked(() => { if (this.baselineId() === undefined) this.baselineId.set(id); });
    });
  }

  protected readonly methodNotice = computed(() => {
    switch (stripeReturnNotice(this.stripe(), this.store.paymentMethod(), this.baselineId(), this.landedAt)) {
      case 'saved': return this.i18n.method_saved();
      case 'saving': return this.i18n.method_saving();
      case 'cancelled': return this.i18n.method_cancelled();
      default: return '';
    }
  });

  protected readonly autoTopUpText = computed(() => {
    const s = this.store.autoTopUp();
    if (!s.enabled || !this.store.hasPaymentMethod()) return this.i18n.autotopup_off();
    return fill(this.i18n.autotopup_on(), { threshold: formatChfAmount(s.threshold), amount: formatChfAmount(s.amount) });
  });

  protected entryText(entry: CreditEntryRow): string {
    const kind = {
      topup: this.i18n.entry_topup(),
      deduction: this.i18n.entry_deduction(),
      reversal: this.i18n.entry_reversal(),
      correction: this.i18n.entry_correction(),
    }[entry.kind] ?? entry.kind;
    return entry.reason ? `${kind}: ${entry.reason}` : kind;
  }

  protected entryDate(entry: CreditEntryRow): string {
    return prettyFormatDateTime(entry.date);
  }

  protected signed(amount: number): string {
    return formatSignedChf(amount);
  }
}
