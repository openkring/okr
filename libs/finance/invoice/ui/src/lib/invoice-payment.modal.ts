import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AccountModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { INVOICE_I18N_KEYS, InvoiceI18n, InvoicePaymentCandidate, InvoicePaymentFormModel, InvoicePaymentInput } from '@okr/finance-invoice-util';

import { InvoicePaymentForm } from './invoice-payment.form';

/**
 * The payment dialog of a native invoice: header + change-confirmation + InvoicePaymentForm. It only
 * collects the input and returns it as `InvoicePaymentInput` (role `confirm`); the store calls
 * `recordInvoicePayment`. The form starts prefilled (today, the open amount, the first payment
 * account), which already is a complete payment — so it starts dirty and "Speichern" is offered at once.
 * "Abbrechen" closes the dialog without recording anything.
 * The bank bookings for mode `link` are read lazily, through `loadCandidates`, the first time that
 * mode is shown — a payment booked on a bank account never reads them.
 */
@Component({
  selector: 'okr-invoice-payment-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, InvoicePaymentForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.payment_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-invoice-payment-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [accounts]="accounts()"
          [candidates]="candidates()"
          [candidatesFailed]="candidatesFailed()"
          [candidatesLoading]="candidatesLoading()"
          [readOnly]="false"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class InvoicePaymentModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(INVOICE_I18N_KEYS) as InvoiceI18n;

  // inputs
  public readonly payment = input.required<InvoicePaymentFormModel>();
  public readonly accounts = input<AccountModel[]>([]);
  /** reads the link candidates; called once, when mode `link` is first shown */
  public readonly loadCandidates = input<() => Promise<InvoicePaymentCandidate[]>>(() => Promise.resolve([]));

  // link candidates, loaded on demand
  protected readonly candidates = signal<InvoicePaymentCandidate[]>([]);
  protected readonly candidatesFailed = signal(false);
  protected readonly candidatesLoading = signal(false);
  private candidatesRequested = false;

  // signals
  protected formDirty = signal(true);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.payment()));
  protected showForm = signal(true);

  // derived
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));

  constructor() {
    effect(() => {
      if (this.formData()?.mode !== 'link' || this.candidatesRequested) return;
      this.candidatesRequested = true;
      untracked(() => void this.readCandidates());
    });
  }

  private async readCandidates(): Promise<void> {
    this.candidatesLoading.set(true);
    try {
      this.candidates.set(await this.loadCandidates()());
    } catch (e) {
      console.error('InvoicePaymentModal: loading the bank bookings failed', e);
      this.candidatesFailed.set(true);
    } finally {
      this.candidatesLoading.set(false);
    }
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const f = this.formData();
    if (!f) return;
    const result: InvoicePaymentInput = {
      mode: f.mode, date: f.date, amount: f.amount,
      bankAccountKey: f.mode === 'post' ? f.bankAccountKey : '',
      bookingKey: f.mode === 'link' ? f.bookingKey : '',
    };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }

  protected onFormDataChange(formData: InvoicePaymentFormModel): void {
    this.formData.set(formData);
  }
}
