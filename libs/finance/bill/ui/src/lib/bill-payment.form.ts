import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';

import { AccountModel } from '@okr/shared-models';
import { DateInput, DateInputI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, convertDateFormatToString, DateFormat, fill } from '@okr/shared-util-core';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { BillI18n, BillPaymentCandidate, BillPaymentFormModel, BillPaymentMode, billPaymentValidations } from '@okr/finance-bill-util';

/** CHF with two decimals, e.g. 1234.5 → '1234.50'. */
const chf = (rappen: number): string => ((rappen ?? 0) / 100).toFixed(2);

/**
 * Records an outgoing payment on an open bill (spec 1.85). Two modes:
 * - *Zahlung buchen* (`post`): date, amount and the account the money left from (one of the
 *   accounting config's bill payment accounts); the server books payables / bank.
 * - *Buchung verknüpfen* (`link`): a posted booking that already debits the payables account (the
 *   payment was entered in the journal); the amount defaults to its debit.
 * The mode switch is hidden when no bill payment account is configured — then linking is the only mode.
 * Amounts are CHF; the service converts them to Rappen.
 */
@Component({
  selector: 'okr-bill-payment-form',
  standalone: true,
  imports: [
    ErrorNote, DateInput, NumberInput, StringSelect, AccountSelect,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonSegment, IonSegmentButton, IonLabel, IonItem, IonNote,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if (canPost()) {
                <ion-row>
                  <ion-col size="12">
                    <ion-segment [value]="mode()" (ionChange)="onModeChange($event.detail.value)" [disabled]="isReadOnly()">
                      <ion-segment-button value="post"><ion-label>{{ i18n().payment_mode_post() }}</ion-label></ion-segment-button>
                      <ion-segment-button value="link"><ion-label>{{ i18n().payment_mode_link() }}</ion-label></ion-segment-button>
                    </ion-segment>
                  </ion-col>
                </ion-row>
              }
              @if (mode() === 'link') {
                <ion-row>
                  <ion-col size="12">
                    @if (candidates().length > 0) {
                      <okr-string-select [i18n]="bookingI18n()" [selectedString]="bookingKey()"
                        (selectedStringChange)="onBookingChange($event)"
                        [stringList]="candidateKeys()" [labels]="candidateLabels()" [readOnly]="isReadOnly()" />
                    } @else if (!candidatesLoading()) {
                      <ion-item lines="none">
                        <ion-note>{{ candidatesFailed() ? i18n().payment_booking_failed() : i18n().payment_booking_none() }}</ion-note>
                      </ion-item>
                    }
                    <okr-error-note [errors]="bookingKeyErrors()" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="dateI18n()" [storeDate]="date()" (storeDateChange)="onFieldChange('date', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="dateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="amountI18n()" [value]="amount()" (valueChange)="onAmountChange($event)"
                    [showHelper]="true" [min]="0" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="amountErrors()" />
                </ion-col>
              </ion-row>
              @if (mode() === 'post') {
                <ion-row>
                  <ion-col size="12">
                    <okr-account-select [i18n]="bankAccountI18n()" [accounts]="accounts()" [selectedKey]="bankAccountKey()"
                      (selectedKeyChange)="onFieldChange('bankAccountKey', $event)" [allowEmpty]="false" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="bankAccountKeyErrors()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `
})
export class BillPaymentForm {
  // inputs
  public readonly i18n = input.required<BillI18n>();
  public readonly formData = model.required<BillPaymentFormModel>();
  /** the accounts a payment may leave from (the config's bill payment accounts) */
  public readonly accounts = input<AccountModel[]>([]);
  /** the bookings mode `link` may point at */
  public readonly candidates = input<BillPaymentCandidate[]>([]);
  /** true when the candidates could not be loaded (shown instead of "none") */
  public readonly candidatesFailed = input(false);
  /** true while the candidates are being read (neither "none" nor "failed" is shown yet) */
  public readonly candidatesLoading = input(false);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly paymentForm = form(this.formData, (path) =>
    validateVestTree(path, billPaymentValidations),
  );

  // per-field Vest errors; validateVestTree calls the suite with the model alone, like this
  private readonly validationResult = computed(() => billPaymentValidations(this.formData()));
  protected readonly dateErrors = computed(() => this.validationResult().getErrors('date'));
  protected readonly amountErrors = computed(() => this.validationResult().getErrors('amount'));
  protected readonly bankAccountKeyErrors = computed(() => this.validationResult().getErrors('bankAccountKey'));
  protected readonly bookingKeyErrors = computed(() => this.validationResult().getErrors('bookingKey'));

  constructor() {
    effect(() => this.valid.emit(this.paymentForm().valid()));
  }

  // field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly canPost = computed(() => this.accounts().length > 0);
  protected readonly mode = computed(() => this.formData()?.mode ?? 'link');
  protected readonly date = computed(() => this.formData()?.date ?? '');
  protected readonly amount = computed(() => this.formData()?.amount ?? 0);
  protected readonly bankAccountKey = computed(() => this.formData()?.bankAccountKey ?? '');
  protected readonly bookingKey = computed(() => this.formData()?.bookingKey ?? '');
  protected readonly candidateKeys = computed(() => this.candidates().map((c) => c.bookingKey));
  protected readonly candidateLabels = computed(() => this.candidates().map((c) => {
    const date = convertDateFormatToString(c.date, DateFormat.StoreDate, DateFormat.ViewDate, false) || c.date;
    const no = c.bookingNo > 0 ? `#${c.bookingNo} · ` : '';
    return `${date} · ${no}${c.title} · CHF ${chf(c.debitedAmount)}`;
  }));

  // i18n for the shared/ui primitives
  protected readonly dateI18n = computed(() => ({
    name: 'billPaymentDate', label: this.i18n().payment_date_input_label(),
    placeholder: this.i18n().payment_date_input_placeholder(), helper: this.i18n().payment_date_input_helper(),
  } as DateInputI18n));
  protected readonly amountI18n = computed(() => ({
    name: 'billPaymentAmount', label: this.i18n().payment_amount_label(), placeholder: this.i18n().payment_amount_placeholder(),
    helper: fill(this.i18n().payment_amount_helper(), { open: (this.formData()?.openAmount ?? 0).toFixed(2) }),
  } as NumberInputI18n));
  protected readonly bankAccountI18n = computed(() => ({
    name: 'billPaymentAccount', label: this.i18n().payment_bankAccount_label(), helper: this.i18n().payment_bankAccount_helper(),
  } as AccountSelectI18n));
  protected readonly bookingI18n = computed(() => ({
    name: 'billPaymentBooking', label: this.i18n().payment_booking_label(), helper: this.i18n().payment_booking_helper(),
  } as StringSelectI18n));

  protected onFieldChange(fieldName: 'date' | 'bankAccountKey', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onModeChange(value: unknown): void {
    const mode: BillPaymentMode = value === 'post' ? 'post' : 'link';
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, mode }));
  }

  protected onAmountChange(value: number | string | null): void {
    const amount = Number(value);
    this.dirty.emit(true);
    // two decimals: the server books Rappen
    this.formData.update((vm) => ({ ...vm, amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0 }));
  }

  /**
   * Selecting a booking takes over its payables debit as amount (never more than is open) and its
   * date as payment date — the money left when the booking says so. Both stay editable.
   */
  protected onBookingChange(bookingKey: string): void {
    const candidate = this.candidates().find((c) => c.bookingKey === bookingKey);
    const bookingAmount = (candidate?.debitedAmount ?? 0) / 100;
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm, bookingKey, bookingAmount,
      amount: candidate ? Math.min(bookingAmount, vm.openAmount) : vm.amount,
      date: candidate?.date || vm.date,
    }));
  }
}
