// libs/finance/collection/feature/src/lib/pay.page.ts
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonContent, IonSpinner } from '@ionic/angular';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { COLLECTION_I18N_KEYS, CollectionI18n, PayErrorKind, payErrorKind } from '@okr/finance-collection-util';

type PayState = 'redirecting' | 'done' | 'cancel' | PayErrorKind;

/**
 * `/pay/:invoiceKey` (authenticated): opens a fresh Stripe Checkout for one of our invoices and leaves for it. Stripe
 * returns with `?stripe=done` (thanks — the webhook, not this redirect, marks the invoice paid) or `?stripe=cancel`
 * (retry). The pay button is disabled while its call runs, so a double click never opens two sessions.
 */
@Component({
  selector: 'okr-pay-page',
  standalone: true,
  imports: [Header, IonContent, IonCard, IonCardContent, IonButton, IonSpinner],
  styles: [`
    .center { display: flex; align-items: center; gap: 12px; }
    ion-button { margin-top: 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.pay_title() }" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          @switch (state()) {
            @case ('redirecting') {
              <div class="center"><ion-spinner name="crescent" /><span>{{ i18n.pay_redirecting() }}</span></div>
            }
            @case ('done') { <p>{{ i18n.pay_done() }}</p> }
            @case ('paid') { <p>{{ i18n.pay_paid() }}</p> }
            @case ('not-tenant') { <p>{{ i18n.pay_not_tenant() }}</p> }
            @case ('cancel') {
              <p>{{ i18n.pay_cancelled() }}</p>
              <ion-button [disabled]="busy()" (click)="pay()">{{ i18n.pay_retry() }}</ion-button>
            }
            @case ('error') {
              <p>{{ i18n.pay_error() }}</p>
              <ion-button [disabled]="busy()" (click)="pay()">{{ i18n.pay_retry() }}</ion-button>
            }
          }
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class PayPage {
  protected readonly i18n = inject(I18nService).translateAll(COLLECTION_I18N_KEYS) as CollectionI18n;
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  /** route param */
  public readonly invoiceKey = input<string | undefined>(undefined);
  /** `?stripe=done|cancel` from the Stripe redirect; undefined on the first visit (route input binding) */
  public readonly stripe = input<string | undefined>(undefined);

  protected readonly state = signal<PayState>('redirecting');
  /** true while createInvoicePaymentSession runs — and after it, while the browser leaves for Stripe */
  protected readonly busy = signal(false);
  private startedFor = '';

  constructor() {
    if (inject(AppStore).env.useEmulators) connectFunctionsEmulator(this.functions, 'localhost', 5001);
    // decide once per (invoice, return state): the route inputs arrive after construction
    effect(() => {
      const key = this.invoiceKey() ?? '';
      const stripe = this.stripe() ?? '';
      untracked(() => this.start(key, stripe));
    });
  }

  private start(key: string, stripe: string): void {
    const marker = `${key}|${stripe}`;
    if (!key || marker === this.startedFor) return;
    this.startedFor = marker;
    if (stripe === 'done') this.state.set('done');
    else if (stripe === 'cancel') this.state.set('cancel');
    else void this.pay();
  }

  protected async pay(): Promise<void> {
    const invoiceKey = this.invoiceKey();
    if (this.busy() || !invoiceKey) return;
    this.busy.set(true);
    this.state.set('redirecting');
    try {
      const fn = httpsCallable<{ invoiceKey: string }, { url: string }>(this.functions, 'createInvoicePaymentSession');
      const { url } = (await fn({ invoiceKey })).data;
      window.location.assign(url); // busy stays true: the page is leaving
    } catch (e) {
      const kind = payErrorKind(e);
      if (kind === 'error') console.error('PayPage: createInvoicePaymentSession failed', e);
      this.state.set(kind);
      this.busy.set(false);
    }
  }
}
