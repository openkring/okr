// libs/finance/collection/feature/src/lib/billing.page.ts
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  IonButton, IonButtons, IonContent, IonItem, IonItemDivider, IonItemGroup, IonLabel, IonList, IonNote, IonSpinner,
  IonToggle,
} from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { fill, getTodayStr, prettyFormatDate, prettyFormatDateTime } from '@okr/shared-util-core';
import {
  formatChfAmount, formatSignedChf, invoiceStateKind, isInvoicePayable, MyBillingInvoice, OptionRow, stripeReturnNotice,
} from '@okr/finance-collection-util';

import { BillingStore, CreditEntryRow } from './billing.store';

/**
 * `/billing` (admin): «Zahlung & Guthaben» — the «Abo» (state, band, paid options, billing e-mail, next invoice), the
 * tenant's bkaiser invoices, the payment method and the prepaid credit. An exempt tenant (contract with bkaiser) sees
 * no Abo controls. Stripe returns here with `?stripe=done|cancel` after saving a method;
 * the notice for `done` turns into «gespeichert» as soon as the webhook has written the method (live listener).
 */
@Component({
  selector: 'okr-billing-page',
  standalone: true,
  providers: [BillingStore],
  imports: [
    Header,
    IonContent, IonList, IonItemGroup, IonItemDivider, IonItem, IonLabel, IonNote, IonButtons, IonButton, IonSpinner,
    IonToggle,
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
            <ion-item-divider><ion-label>{{ i18n.abo_title() }}</ion-label></ion-item-divider>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">{{ stateText() }}</ion-label>
            </ion-item>
            @if (!store.isExempt()) {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h3>{{ i18n.abo_band() }}: {{ store.currentBand() || i18n.abo_band_none() }}</h3>
                  @if (measurementText(); as m) { <p>{{ m }}</p> }
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">{{ i18n.abo_estimate() }}</ion-label>
                <ion-label slot="end" class="amount">{{ estimateText() }}</ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h3>{{ i18n.abo_email() }}</h3>
                  <p>{{ store.billingEmail() || i18n.abo_email_none() }}</p>
                </ion-label>
                <ion-buttons slot="end">
                  <ion-button fill="outline" [disabled]="store.busy()" (click)="store.editBillingEmail()">{{ i18n.abo_email_change() }}</ion-button>
                </ion-buttons>
              </ion-item>
              <ion-item-divider><ion-label>{{ i18n.abo_options_title() }}</ion-label></ion-item-divider>
              @for (opt of store.optionRows(); track opt.id) {
                <ion-item>
                  @if (opt.available || opt.subscribed) {
                    <ion-toggle justify="space-between" [checked]="opt.subscribed"
                      [disabled]="store.busy() || !store.canChangeOptions() || (!opt.available && !opt.subscribed)"
                      (ionChange)="onToggle(opt, $event)">
                      <span class="ion-text-wrap">{{ store.optionName(opt.id) }}</span><br />
                      <ion-note>{{ perMonth(opt.price) }}</ion-note>
                    </ion-toggle>
                  } @else {
                    <ion-label class="ion-text-wrap">
                      <h3>{{ store.optionName(opt.id) }}</h3>
                      <p>{{ perMonth(opt.price) }}</p>
                    </ion-label>
                    <ion-note slot="end">{{ i18n.abo_option_soon() }}</ion-note>
                  }
                </ion-item>
              }
            }
          </ion-item-group>

          <ion-item-group>
            <ion-item-divider><ion-label>{{ i18n.invoices_title() }}</ion-label></ion-item-divider>
            @if (store.invoicesLoading() && store.invoices().length === 0) {
              <ion-item lines="none">
                <ion-spinner slot="start" name="crescent" />
                <ion-label>{{ i18n.loading() }}</ion-label>
              </ion-item>
            } @else {
              @for (inv of store.invoices(); track inv.invoiceKey) {
                <ion-item>
                  <ion-label class="ion-text-wrap">
                    <h3>{{ invoiceNumber(inv) }}</h3>
                    <p>{{ invoiceDate(inv) }} · {{ invoiceState(inv) }}</p>
                  </ion-label>
                  <ion-label slot="end" class="amount">CHF {{ chf(inv.totalAmount) }}</ion-label>
                  <ion-buttons slot="end">
                    @if (payable(inv)) {
                      <ion-button fill="outline" [disabled]="store.busy()" (click)="store.payInvoice(inv.invoiceKey)">{{ i18n.invoices_pay() }}</ion-button>
                    }
                    <ion-button fill="clear" [disabled]="store.busy()" (click)="store.openInvoicePdf(inv)">{{ i18n.invoices_pdf() }}</ion-button>
                  </ion-buttons>
                </ion-item>
              } @empty {
                <ion-item lines="none"><ion-note>{{ i18n.invoices_empty() }}</ion-note></ion-item>
              }
            }
          </ion-item-group>

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

  /** the state text of the «Abo» card; «Vertrag mit bkaiser» for an exempt tenant */
  protected readonly stateText = computed(() => {
    switch (this.store.aboState()) {
      case 'exempt': return this.i18n.abo_state_exempt();
      case 'pastDue': return this.i18n.abo_state_pastDue();
      case 'closing': return this.i18n.abo_state_closing();
      case 'closed': return this.i18n.abo_state_closed();
      case 'cancelled': return this.i18n.abo_state_cancelled();
      default: return this.i18n.abo_state_active();
    }
  });

  protected readonly measurementText = computed(() => {
    const m = this.store.measurement();
    if (!m) return '';
    return fill(this.i18n.abo_measurement(), { total: Number(m.totalUsers ?? 0), privileged: Number(m.privilegedUsers ?? 0) });
  });

  protected readonly estimateText = computed(() => {
    const e = this.store.estimate();
    if (e.kind === 'unmeasured') return this.i18n.abo_estimate_unmeasured();
    if (e.kind === 'individual') return this.i18n.abo_estimate_individual();
    return `CHF ${formatChfAmount(e.amount)}`;
  });

  /** today as StoreDate, for «überfällig» */
  private readonly today = getTodayStr();

  protected perMonth(priceChf: number): string {
    return fill(this.i18n.abo_per_month(), { amount: formatChfAmount(priceChf * 100) });
  }

  /** A declined or failed change sets the toggle back: its [checked] binding has not changed, so it would not re-render. */
  protected async onToggle(opt: OptionRow, event: Event): Promise<void> {
    const toggle = event.target as HTMLIonToggleElement;
    const on = toggle.checked;
    const saved = await this.store.setOption(opt.id, on);
    if (!saved) toggle.checked = !on;
  }

  protected invoiceNumber(inv: MyBillingInvoice): string {
    return fill(this.i18n.invoices_number(), { no: inv.invoiceNo || inv.invoiceKey });
  }

  protected invoiceDate(inv: MyBillingInvoice): string {
    return prettyFormatDate(inv.invoiceDate);
  }

  protected invoiceState(inv: MyBillingInvoice): string {
    switch (invoiceStateKind(inv, this.today)) {
      case 'paid': return this.i18n.invoice_state_paid();
      case 'overdue': return this.i18n.invoice_state_overdue();
      case 'partial': return this.i18n.invoice_state_partial();
      case 'cancelled': return this.i18n.invoice_state_cancelled();
      default: return this.i18n.invoice_state_open();
    }
  }

  protected payable(inv: MyBillingInvoice): boolean {
    return isInvoicePayable(inv);
  }

  protected chf(rappen: number): string {
    return formatChfAmount(rappen);
  }

  protected entryText(entry: CreditEntryRow): string {
    const kind = {
      topup: this.i18n.entry_topup(),
      deduction: this.i18n.entry_deduction(),
      reversal: this.i18n.entry_reversal(),
      correction: this.i18n.entry_correction(),
      refund: this.i18n.entry_refund(),
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
