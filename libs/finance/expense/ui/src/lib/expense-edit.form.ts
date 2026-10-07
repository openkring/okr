import { Component, computed, effect, input, model, output, signal, Signal, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import {
  IonAvatar, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel,
  IonNote, IonRow, IonSelect, IonSelectOption,
} from '@ionic/angular/standalone';

import { AccountModel, CategoryListModel, CostCenterModel, ExpenseModel } from '@okr/shared-models';
import { ButtonCopy, CategorySelect, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { formatIban, IbanFormat, validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, convertDateFormatToString, DateFormat, getThumbnailUrl, isProfitAndLossAccountId } from '@okr/shared-util-core';

import { AvatarPipe } from '@okr/avatar-ui';
import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import {
  ALLOWED_CURRENCIES, centsToCHF, chfToCents, ExpenseEditFormValue, expenseEditValidations, ExpenseQrBill, ExpenseReceipt,
} from '@okr/finance-expense-util';

export type { ExpenseEditFormValue };

/** The labels this form needs. A subset of ExpenseI18n, adapted at the shared/ui boundary. */
export interface ExpenseEditFormI18n {
  date_label: Signal<string>;
  author_label: Signal<string>;
  abstract_label: Signal<string>;
  amount_label: Signal<string>;
  currency_label: Signal<string>;
  transfer_label: Signal<string>;
  transfer_me: Signal<string>;
  transfer_issuer: Signal<string>;
  iban_label: Signal<string>;
  iban_copy_conf: Signal<string>;
  qr_hint: Signal<string>;
  qrbill_title: Signal<string>;
  qrbill_creditor: Signal<string>;
  qrbill_reference: Signal<string>;
  account_label: Signal<string>;
  cost_center_label: Signal<string>;
  note_label: Signal<string>;
  field_status: Signal<string>;
  receipts_label: Signal<string>;
  edit_locked_hint: Signal<string>;
  ocr_error: Signal<string>;
}

/**
 * The expense form — the SAME content for viewing (`readOnly`, the view modal) and editing (the
 * treasurer edit modal), so both always show the same thing. Read-only parts (date, author, IBAN
 * with copy button and Swiss QR code, receipts) render in both modes; the account picker only
 * while editing.
 *
 * Once the expense is booked, `lockedFields` renders the accounting controls read-only; the
 * `updateExpense` CF refuses a changed locked field, so this is a UI mirror of a server rule.
 * The IBAN is never editable here: `updateExpense` does not accept it (a changed payout account
 * is a fraud vector, it stays the submitter's).
 */
@Component({
  selector: 'okr-expense-edit-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, ErrorNote, CategorySelect, ButtonCopy, AccountSelect, CostCenterSelect, AvatarPipe,
    IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote,
    IonSelect, IonSelectOption, IonAvatar, IonImg,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-avatar { width: 32px; height: 32px; background-color: var(--ion-color-light); }
    .iban { font-family: monospace; font-size: 1.05rem; letter-spacing: 0.02em; }
    .qr { display: flex; justify-content: center; padding: 8px; }
    .qr img { width: 180px; height: 180px; border-radius: 4px; }
    .receipts { display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 16px 16px; }
    .receipt {
      width: 120px; cursor: pointer; border-radius: 6px; overflow: hidden;
      border: 1px solid var(--ion-color-step-150, #d7d8da); background: var(--ion-color-light);
    }
    .receipt:focus-visible { outline: 2px solid var(--ion-color-primary); }
    .receipt img { display: block; width: 120px; height: 120px; object-fit: cover; background: #fff; }
    .receipt .name {
      display: block; padding: 4px 6px; font-size: 0.75rem; color: var(--ion-color-medium-shade);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <!-- a failed OCR is a flag on a 'processing' expense, not a status of its own -->
        @if (ocrError()) {
          <ion-card color="danger">
            <ion-card-header>
              <ion-card-title>{{ i18n().ocr_error() }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>{{ ocrError() }}</ion-card-content>
          </ion-card>
        }
        <ion-card>
          <ion-card-content class="ion-no-padding">
            @if (isLockedForm() && !isReadOnly()) {
              <ion-item lines="none">
                <ion-note color="warning">{{ i18n().edit_locked_hint() }}</ion-note>
              </ion-item>
            }
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="dateI18n()" [value]="viewDate()" [readOnly]="true" [clearInput]="false" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ authorKey() | avatar:'person' }}" alt="Avatar" />
                    </ion-avatar>
                    <ion-label>
                      <p>{{ i18n().author_label() }}</p>
                      <h3>{{ authorName() }}</h3>
                    </ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="abstractI18n()" [value]="abstract()"
                    (valueChange)="onFieldChange('abstract', $event)"
                    [autofocus]="!isReadOnly()" [maxLength]="abstractLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="abstractErrors()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="amountI18n()" [value]="amountInput()"
                    (valueChange)="onAmountChange($event)"
                    [maxLength]="10" [readOnly]="isFieldReadOnly('amountTotal')" />
                  <okr-error-note [errors]="amountErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-select [label]="i18n().currency_label()" labelPlacement="floating"
                      [value]="currency()" [disabled]="isFieldReadOnly('currency')"
                      (ionChange)="onFieldChange('currency', $event.detail.value)">
                      @for (c of currencies; track c) {
                        <ion-select-option [value]="c">{{ c }}</ion-select-option>
                      }
                    </ion-select>
                  </ion-item>
                  <okr-error-note [errors]="currencyErrors()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [selectedItemName]="status()"
                    (selectedItemNameChange)="onFieldChange('status', $event)"
                    [category]="statuses()" [readOnly]="isFieldReadOnly('status')"
                    [fieldStyle]="true" [label]="i18n().field_status()" [showIcons]="true" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-select [label]="i18n().transfer_label()" labelPlacement="floating"
                      [value]="transferTo()" [disabled]="isFieldReadOnly('transferTo')"
                      (ionChange)="onFieldChange('transferTo', $event.detail.value)">
                      <ion-select-option value="me">{{ i18n().transfer_me() }}</ion-select-option>
                      <ion-select-option value="issuer">{{ i18n().transfer_issuer() }}</ion-select-option>
                    </ion-select>
                  </ion-item>
                </ion-col>
              </ion-row>

              @if (iban()) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none">
                      <ion-label>
                        <p>{{ i18n().iban_label() }}</p>
                        <h3 class="iban">{{ iban() }}</h3>
                      </ion-label>
                      <okr-button-copy slot="end" [value]="ibanElectronic()" [i18n]="copyI18n()" />
                    </ion-item>
                    @if (showQrHint()) {
                      <ion-item lines="none">
                        <ion-note>{{ i18n().qr_hint() }}</ion-note>
                      </ion-item>
                    }
                  </ion-col>
                  @if (qrCode()) {
                    <ion-col size="12" size-md="6" class="qr">
                      <img [src]="qrCode()" [alt]="i18n().iban_label()" />
                    </ion-col>
                  }
                </ion-row>
              }

              @if (!isReadOnly()) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-account-select [i18n]="accountI18n()" [accounts]="accounts()" [allowEmpty]="true"
                      [selectedKey]="accountKey()" (selectedKeyChange)="onFieldChange('accountKey', $event)"
                      [readOnly]="false" />
                  </ion-col>
                  @if (showCostCenter()) {
                    <ion-col size="12" size-md="6">
                      <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenters()" [allowEmpty]="true" [emptyIsFallback]="true"
                        [selectedKey]="costCenterId()" (selectedKeyChange)="onFieldChange('costCenterId', $event)"
                        [readOnly]="false" />
                    </ion-col>
                  }
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- the Swiss QR-bill printed on a receipt, decoded by the OCR pipeline (debtor removed) -->
        @for (qr of qrBills(); track qr.receiptName) {
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ i18n().qrbill_title() }}</ion-card-title>
            </ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none">
                      <ion-label>
                        <p>{{ i18n().qrbill_creditor() }}</p>
                        <h3>{{ qr.bill.creditorName }}</h3>
                        <p>{{ qr.bill.creditorStreet }}</p>
                        <p>{{ qr.bill.creditorPlace }}</p>
                      </ion-label>
                    </ion-item>
                    <ion-item lines="none">
                      <ion-label>
                        <p>{{ i18n().iban_label() }}</p>
                        <h3 class="iban">{{ formatIban(qr.bill.iban) }}</h3>
                      </ion-label>
                      <okr-button-copy slot="end" [value]="qr.bill.iban" [i18n]="copyI18n()" />
                    </ion-item>
                    @if (qr.bill.amount) {
                      <ion-item lines="none">
                        <ion-label>
                          <p>{{ i18n().amount_label() }}</p>
                          <h3>{{ qr.bill.amount }} {{ qr.bill.currency }}</h3>
                        </ion-label>
                      </ion-item>
                    }
                    @if (qr.bill.reference) {
                      <ion-item lines="none">
                        <ion-label>
                          <p>{{ i18n().qrbill_reference() }}</p>
                          <h3 class="iban">{{ qr.bill.reference }}</h3>
                        </ion-label>
                      </ion-item>
                    }
                    <ion-item lines="none">
                      <ion-note>{{ qr.receiptName }}</ion-note>
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="6" class="qr">
                    <img [src]="qr.qrCode" [alt]="i18n().qrbill_title()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }

        @if (receipts().length > 0) {
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ i18n().receipts_label() }}</ion-card-title>
            </ion-card-header>
            <div class="receipts">
              @for (receipt of receipts(); track receipt.path) {
                <div class="receipt" tabindex="0" role="button" [attr.aria-label]="receipt.name"
                  (click)="receiptSelected.emit(receipt)" (keyup.enter)="receiptSelected.emit(receipt)">
                  <img [src]="thumbnail(receipt)" [alt]="receipt.name" loading="lazy" />
                  <span class="name">{{ receipt.name }}</span>
                </div>
              }
            </div>
          </ion-card>
        }

        @if (!isReadOnly() || note()) {
          <okr-notes-input [i18n]="noteI18n()" [value]="note()"
            (valueChange)="onFieldChange('note', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class ExpenseEditForm {
  // inputs
  public formData = model.required<ExpenseEditFormValue>();
  public readonly i18n = input.required<ExpenseEditFormI18n>();
  /** the stored expense — the read-only parts (date, IBAN) come from it, not from the form value */
  public readonly expense = input.required<ExpenseModel>();
  /** true in the view modal: everything renders, nothing is editable */
  public readonly readOnly = input(false);
  /** from lockedExpenseFields() — these controls render read-only */
  public readonly lockedFields = input<string[]>([]);
  public readonly statuses = input.required<CategoryListModel>();
  /** 'person.<okey>' of the submitter, for the avatar ('' shows the default icon) */
  public readonly authorKey = input('');
  public readonly authorName = input('');
  public readonly accounts = input<AccountModel[]>([]);
  /** the Kostenstellen of the accounting tenant; passed in because a ui lib must not inject a feature store */
  public readonly costCenters = input<CostCenterModel[]>([]);
  /** Kostenstellen only exist on the native ledger; a bexio ledger gets no picker */
  public readonly costCentersEnabled = input(false);
  public readonly receipts = input<ExpenseReceipt[]>([]);
  /** the QR-bills found on the receipts (ocr-results.qrBill) */
  public readonly qrBills = input<ExpenseQrBill[]>([]);
  /** the Swiss QR payment code as a data url; '' when none can be built (qr_hint explains) */
  public readonly qrCode = input('');
  public readonly imgixBaseUrl = input.required<string>();
  /** toggled by the parent on cancel to recreate the form and clear the Vest state */
  public readonly showForm = input(true);

  // outputs
  public readonly valid = output<boolean>();
  public readonly dirty = output<boolean>();
  public readonly receiptSelected = output<ExpenseReceipt>();

  protected readonly currencies = ALLOWED_CURRENCIES;
  /** kept in step with the cap the Vest suite enforces on `abstract` */
  protected readonly abstractLength = 200;

  constructor() {
    effect(() => this.valid.emit(this.expenseEditForm().valid()));
    // Seed the amount field from the model ONCE per form instance (and again when the parent
    // toggles showForm to reset it). It must NEVER be re-derived from `amountTotal` while the
    // user types: cents -> string is not idempotent ('2' would snap to '2.00', and the next
    // keystroke would produce a DOM value NgModel refuses to write back), so the field would
    // silently drift from the stored amount. `untracked` keeps formData out of the dependency set.
    effect(() => {
      this.showForm();
      const cents = untracked(() => this.formData().amountTotal ?? 0);
      // `.toFixed(2)` is safe HERE and only here — this runs once per form instance, so
      // CHF 42.50 loads as '42.50' instead of '42.5' without ever reformatting mid-typing.
      this.amountInput.set(cents > 0 ? centsToCHF(cents).toFixed(2) : '');
    });
  }

  // validation and errors — the suite takes only (model, field?), so the bridge gets it directly
  protected readonly expenseEditForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, expenseEditValidations as any));
  private readonly validationResult = computed(() => expenseEditValidations(this.formData()));
  protected readonly abstractErrors = computed(() => this.validationResult().getErrors('abstract'));
  protected readonly amountErrors   = computed(() => this.validationResult().getErrors('amountTotal'));
  protected readonly currencyErrors = computed(() => this.validationResult().getErrors('currency'));

  // fields
  protected readonly abstract = computed(() => this.formData()?.abstract ?? '');
  protected readonly currency = computed(() => this.formData()?.currency ?? 'CHF');
  protected readonly transferTo = computed(() => this.formData()?.transferTo ?? 'me');
  protected readonly accountKey = computed(() => this.formData()?.accountKey ?? '');
  protected showCostCenter = computed(() =>
    this.costCentersEnabled() && isProfitAndLossAccountId(this.accounts().find(a => a.okey === this.accountKey())?.id));
  protected readonly costCenterId = computed(() => this.formData()?.costCenterId ?? '');
  protected readonly note = computed(() => this.formData()?.note ?? '');
  protected readonly status = computed(() => this.formData()?.status ?? 'draft');

  // read-only parts
  /** creationDateTime is a StoreDateTime; non-strict conversion yields '' for legacy docs without one. */
  protected readonly viewDate = computed(() =>
    convertDateFormatToString(this.expense().creationDateTime, DateFormat.StoreDateTime, DateFormat.ViewDate, false));
  /** formatIban returns '' for a value it cannot parse — show the raw value then, never nothing. */
  protected readonly iban = computed(() => {
    const raw = this.expense().iban ?? '';
    return formatIban(raw, IbanFormat.Friendly) || raw;
  });
  /**
   * "No QR code possible" — except for a transfer to the issuer whose receipt carries its own
   * QR-bill: that card below IS the code to pay with.
   */
  protected readonly showQrHint = computed(() =>
    !this.qrCode() && !(this.transferTo() === 'issuer' && this.qrBills().length > 0));

  protected formatIban(iban: string): string {
    return formatIban(iban, IbanFormat.Friendly) || iban;
  }

  /** Legacy documents predate `ocrError` — coalesce. */
  protected readonly ocrError = computed(() => this.expense().ocrError ?? '');
  protected readonly ibanElectronic = computed(() => (this.expense().iban ?? '').replace(/\s/g, '').toUpperCase());

  /**
   * The raw text the treasurer typed. The single source of truth for what the amount field shows;
   * cents are derived FROM it in onAmountChange, never the other way round while editing.
   */
  protected readonly amountInput = signal('');

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  /** A booked expense locks the accounting fields — the status stays editable. */
  protected isFieldReadOnly(field: string): boolean {
    return this.isReadOnly() || this.lockedFields().includes(field);
  }
  protected readonly isLockedForm = computed(() => this.lockedFields().length > 0);

  protected readonly dateI18n = computed(() => ({
    name: 'creationDate', label: this.i18n().date_label(), placeholder: '', helper: '',
  } as TextInputI18n));

  protected readonly abstractI18n = computed(() => ({
    name: 'abstract', label: this.i18n().abstract_label(), placeholder: '', helper: '',
  } as TextInputI18n));

  protected readonly amountI18n = computed(() => ({
    name: 'amountTotal', label: this.i18n().amount_label(), placeholder: '', helper: '',
  } as TextInputI18n));

  protected readonly accountI18n = computed(() => ({
    name: 'accountKey', label: this.i18n().account_label(),
  } as AccountSelectI18n));

  protected readonly costCenterI18n = computed(() => ({
    name: 'costCenterId', label: this.i18n().cost_center_label(),
  } as CostCenterSelectI18n));

  protected readonly copyI18n = computed(() => ({ copy_conf: this.i18n().iban_copy_conf() }));

  protected readonly noteI18n = computed(() => ({
    name: 'note', label: this.i18n().note_label(), placeholder: '',
  } as NotesInputI18n));

  /** imgix renders images and the first page of a pdf; any other file type gets its file-type icon. */
  protected thumbnail(receipt: ExpenseReceipt): string {
    const url = getThumbnailUrl(receipt.path, '240', '240');
    return url.startsWith('tenant') ? `${this.imgixBaseUrl()}/${url}` : url;
  }

  /******************************* actions *************************************** */
  protected onAmountChange(value: string): void {
    this.amountInput.set(value);   // keep the typed text verbatim — see the seeding effect
    const parsed = parseFloat(value.replace(',', '.'));
    this.onFieldChange('amountTotal', isNaN(parsed) ? 0 : chfToCents(parsed));
  }

  protected onFieldChange(fieldName: string, fieldValue: string | number): void {
    if (this.isReadOnly()) return;
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
