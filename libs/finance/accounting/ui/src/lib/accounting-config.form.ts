import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonNote, IonRow, IonSelect, IonSelectOption, SelectChangeEventDetail } from '@ionic/angular/standalone';

import { NumberInput, NumberInputI18n, ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountingConfigModel, AccountModel, CostCenterModel, DEFAULT_INCOMING_PAYMENT_LABEL, DEFAULT_OUTGOING_PAYMENT_LABEL, TemplateModel } from '@okr/shared-models';
import { coerceBoolean } from '@okr/shared-util-core';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import { leafAccounts } from '@okr/finance-account-util';
import { AccountingI18n, accountingConfigValidations, REMINDER_DAYS_MAX, reminderFeeOf, reminderFeeRappen } from '@okr/finance-accounting-util';

export type { AccountingI18n };

/**
 * The account links of an accounting tenant: which account an expense posts to when no OCR rule
 * matches, and which payables account an employee reimbursement is booked against. Both store an
 * account `okey`; without them the expense→booking posting (1.20) has no fallback account.
 * Plus the fiscal year start month (1 = calendar year), which the period assignment of bank-import
 * and OCR bookings reads, and the book default Kostenstelle — the last fallback of P&L lines (1.65).
 * Mahnwesen (1.76 phase 3): reminder template, fee account, fees per level (CHF in the form, Rappen
 * in the model), grace days before a Mahnlauf offers a reminder and the days a reminder grants.
 */
@Component({
  selector: 'okr-accounting-config-form',
  standalone: true,
  imports: [
    ErrorNote, AccountSelect, CostCenterSelect, NumberInput, TextInput, IonSelect, IonSelectOption, IonNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="expenseAccountI18n()" [accounts]="accounts()"
                    [selectedKey]="defaultExpenseAccountKey()"
                    (selectedKeyChange)="onFieldChange('defaultExpenseAccountKey', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="payablesAccountI18n()" [accounts]="accounts()"
                    [selectedKey]="employeePayablesAccountKey()"
                    (selectedKeyChange)="onFieldChange('employeePayablesAccountKey', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="receivablesAccountI18n()" [accounts]="leaves()"
                    [selectedKey]="receivablesAccountKey()"
                    (selectedKeyChange)="onFieldChange('receivablesAccountKey', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="receivablesAccountKeyErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-select [label]="i18n().invoice_template()" labelPlacement="floating"
                    [placeholder]="i18n().invoice_template_placeholder()"
                    [value]="invoiceTemplateId()" [disabled]="isReadOnly()"
                    (ionChange)="onInvoiceTemplateChange($event)">
                    @for (template of templateChoices(); track template.okey) {
                      <ion-select-option [value]="template.okey">{{ template.name || template.okey }}</ion-select-option>
                    }
                  </ion-select>
                  <ion-note>{{ i18n().invoice_template_helper() }}
                    @if (showTemplateLink()) {
                      <a href="" (click)="$event.preventDefault(); addTemplate.emit()">{{ i18n().invoice_template_add() }}</a>
                    }
                  </ion-note>
                  <okr-error-note [errors]="invoiceTemplateIdErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-select [label]="i18n().payment_accounts()" labelPlacement="floating" [multiple]="true"
                    [value]="invoicePaymentAccountKeys()" [disabled]="isReadOnly()"
                    (ionChange)="onPaymentAccountsChange($event)">
                    @for (account of paymentAccountChoices(); track account.okey) {
                      <ion-select-option [value]="account.okey">{{ account.id }} — {{ account.name }}</ion-select-option>
                    }
                  </ion-select>
                  <ion-note>{{ i18n().payment_accounts_helper() }}</ion-note>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="discountAccountI18n()" [accounts]="leaves()"
                    [selectedKey]="discountAccountKey()"
                    (selectedKeyChange)="onFieldChange('discountAccountKey', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="billPayablesAccountI18n()" [accounts]="leaves()"
                    [selectedKey]="payablesAccountKey()"
                    (selectedKeyChange)="onFieldChange('payablesAccountKey', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-select [label]="i18n().bill_payment_accounts()" labelPlacement="floating" [multiple]="true"
                    [value]="billPaymentAccountKeys()" [disabled]="isReadOnly()"
                    (ionChange)="onBillPaymentAccountsChange($event)">
                    @for (account of paymentAccountChoices(); track account.okey) {
                      <ion-select-option [value]="account.okey">{{ account.id }} — {{ account.name }}</ion-select-option>
                    }
                  </ion-select>
                  <ion-note>{{ i18n().bill_payment_accounts_helper() }}</ion-note>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="fiscalYearStartI18n()" [value]="fiscalYearStart()"
                    (valueChange)="onFieldChange('fiscalYearStart', $event)"
                    [integer]="true" [min]="1" [max]="12" [maxLength]="2" [inputMode]="'numeric'"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="fiscalYearStartErrors()" />
                </ion-col>
                <!-- the last fallback Kostenstelle of P&L lines; Kostenstellen exist on the native ledger only -->
                @if (costCentersEnabled()) {
                  <ion-col size="12" size-md="6">
                    <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenters()" [allowEmpty]="true"
                      [selectedKey]="defaultCostCenterKey()" (selectedKeyChange)="onFieldChange('defaultCostCenterKey', $event)"
                      [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="defaultCostCenterKeyErrors()" />
                  </ion-col>
                }
              </ion-row>
              <!-- Mahnwesen (1.76 phase 3) -->
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-select [label]="i18n().reminder_template()" labelPlacement="floating"
                    [placeholder]="i18n().reminder_template_placeholder()"
                    [value]="reminderTemplateId()" [disabled]="isReadOnly()"
                    (ionChange)="onReminderTemplateChange($event)">
                    @for (template of reminderTemplateChoices(); track template.okey) {
                      <ion-select-option [value]="template.okey">{{ template.name || template.okey }}</ion-select-option>
                    }
                  </ion-select>
                  <ion-note>{{ i18n().reminder_template_helper() }}
                    @if (showTemplateLink()) {
                      <a href="" (click)="$event.preventDefault(); addTemplate.emit()">{{ i18n().invoice_template_add() }}</a>
                    }
                  </ion-note>
                  <okr-error-note [errors]="reminderTemplateIdErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="reminderFeeAccountI18n()" [accounts]="leaves()"
                    [selectedKey]="reminderFeeAccountKey()"
                    (selectedKeyChange)="onFieldChange('reminderFeeAccountKey', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="reminderFeeAccountKeyErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="4">
                  <okr-number-input [i18n]="reminderFee1I18n()" [value]="reminderFee1Chf()"
                    (valueChange)="onReminderFeeChange(1, $event)"
                    [min]="0" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="reminderFee1Errors()" />
                </ion-col>
                <ion-col size="12" size-md="4">
                  <okr-number-input [i18n]="reminderFee2I18n()" [value]="reminderFee2Chf()"
                    (valueChange)="onReminderFeeChange(2, $event)"
                    [min]="0" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="reminderFee2Errors()" />
                </ion-col>
                <ion-col size="12" size-md="4">
                  <okr-number-input [i18n]="reminderFee3I18n()" [value]="reminderFee3Chf()"
                    (valueChange)="onReminderFeeChange(3, $event)"
                    [min]="0" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="reminderFee3Errors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="reminderGraceDaysI18n()" [value]="reminderGraceDays()"
                    (valueChange)="onFieldChange('reminderGraceDays', $event)"
                    [integer]="true" [min]="0" [max]="reminderDaysMax" [maxLength]="reminderDaysLength" [inputMode]="'numeric'"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="reminderGraceDaysErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="reminderDueDaysI18n()" [value]="reminderDueDays()"
                    (valueChange)="onFieldChange('reminderDueDays', $event)"
                    [integer]="true" [min]="0" [max]="reminderDaysMax" [maxLength]="reminderDaysLength" [inputMode]="'numeric'"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="reminderDueDaysErrors()" />
                </ion-col>
              </ion-row>
              <!-- how the journal shows bexio's payment words (display only, the stored text stays) -->
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="incomingPaymentLabelI18n()" [value]="incomingPaymentLabel()"
                    (valueChange)="onFieldChange('incomingPaymentLabel', $event)"
                    [maxLength]="paymentLabelLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="incomingPaymentLabelErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="outgoingPaymentLabelI18n()" [value]="outgoingPaymentLabel()"
                    (valueChange)="onFieldChange('outgoingPaymentLabel', $event)"
                    [maxLength]="paymentLabelLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="outgoingPaymentLabelErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `
})
export class AccountingConfigForm {
  public readonly formData = model.required<AccountingConfigModel>();
  public readonly accounts = input.required<AccountModel[]>();
  /** the accounting tenant's Kostenstellen (archived included); the picker offers active leaves only */
  public readonly costCenters = input<CostCenterModel[]>([]);
  /** Kostenstellen only exist on the native ledger; a bexio ledger gets no picker. */
  public readonly costCentersEnabled = input(false);
  public readonly tenantId = input.required<string>();
  public readonly i18n = input.required<AccountingI18n>();
  /** the tenant's PDF templates; the invoice template is picked from those of category `invoice`, the reminder template from `dunning` */
  public readonly templates = input<TemplateModel[]>([]);
  /** show the link to the template list (only for users who may open it) */
  public readonly showTemplateLink = input(false);
  public readonly readOnly = input(true);
  public showForm = input(true);

  public dirty = output<boolean>();
  public addTemplate = output<void>();
  public valid = output<boolean>();

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected defaultExpenseAccountKey = linkedSignal(() => this.formData().defaultExpenseAccountKey ?? '');
  protected employeePayablesAccountKey = linkedSignal(() => this.formData().employeePayablesAccountKey ?? '');
  protected receivablesAccountKey = linkedSignal(() => this.formData().receivablesAccountKey ?? '');
  protected invoiceTemplateId = linkedSignal(() => this.formData().invoiceTemplateId ?? '');
  // legacy config docs predate the field (spec 1.84): '' = a discount reduces the revenue above it
  protected discountAccountKey = linkedSignal(() => this.formData().discountAccountKey ?? '');
  // legacy config docs predate the field: '' = keine Kostenstelle
  protected defaultCostCenterKey = linkedSignal(() => this.formData().defaultCostCenterKey ?? '');
  // Invoice templates only, but never drop the stored one: a config pointing at a template of
  // another category (or one not yet loaded) must still show its value instead of a blank select.
  protected templateChoices = computed(() => {
    const id = this.invoiceTemplateId();
    return this.templates()
      .filter(t => t.category === 'invoice' || t.okey === id)
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  });
  protected invoicePaymentAccountKeys = linkedSignal(() => this.formData().invoicePaymentAccountKeys ?? []);
  // spec 1.85 B6 — legacy config docs predate both fields
  protected payablesAccountKey = linkedSignal(() => this.formData().payablesAccountKey ?? '');
  protected billPaymentAccountKeys = linkedSignal(() => this.formData().billPaymentAccountKeys ?? []);
  /** leaf accounts of class 1 (assets): the accounts an invoice payment may be posted to */
  protected leaves = computed(() => leafAccounts(this.accounts()));
  protected paymentAccountChoices = computed(() =>
    this.leaves().filter(a => String(a.id).replace(/^0+/, '').startsWith('1')).sort((a, b) => a.id.localeCompare(b.id)));
  // Legacy config docs predate the field; coalesce to the calendar year like the Cloud Functions do.
  protected fiscalYearStart = linkedSignal(() => this.formData().fiscalYearStart ?? 1);

  protected expenseAccountI18n = computed(() => ({
    name: 'defaultExpenseAccountKey', label: this.i18n().expense_account(), helper: this.i18n().expense_account_helper()
  } as AccountSelectI18n));

  protected payablesAccountI18n = computed(() => ({
    name: 'employeePayablesAccountKey', label: this.i18n().payables_account(), helper: this.i18n().payables_account_helper()
  } as AccountSelectI18n));

  protected receivablesAccountI18n = computed(() => ({
    name: 'receivablesAccountKey', label: this.i18n().receivables_account(), helper: this.i18n().receivables_account_helper()
  } as AccountSelectI18n));

  protected billPayablesAccountI18n = computed(() => ({
    name: 'payablesAccountKey', label: this.i18n().bill_payables_account(), helper: this.i18n().bill_payables_account_helper()
  } as AccountSelectI18n));

  protected discountAccountI18n = computed(() => ({
    name: 'discountAccountKey', label: this.i18n().discount_account(), helper: this.i18n().discount_account_helper()
  } as AccountSelectI18n));

  protected costCenterI18n = computed(() => ({
    name: 'defaultCostCenterKey', label: this.i18n().cost_center(), helper: this.i18n().cost_center_helper()
  } as CostCenterSelectI18n));

  protected fiscalYearStartI18n = computed(() => ({
    name: 'fiscalYearStart', label: this.i18n().fiscal_year_start(),
    placeholder: this.i18n().fiscal_year_start_placeholder(), helper: this.i18n().fiscal_year_start_helper()
  } as NumberInputI18n));

  // Mahnwesen (1.76 phase 3) — legacy config docs lack the fields: show the model defaults
  /** kept in step with the upper bound the Vest suite enforces on grace and due days */
  protected readonly reminderDaysMax = REMINDER_DAYS_MAX;
  protected readonly reminderDaysLength = String(REMINDER_DAYS_MAX).length;
  /** kept in step with the cap the Vest suite enforces on the two payment labels */
  protected readonly paymentLabelLength = SHORT_NAME_LENGTH;
  // legacy config docs predate the fields: the defaults GS / BA
  protected incomingPaymentLabel = linkedSignal(() => this.formData().incomingPaymentLabel ?? DEFAULT_INCOMING_PAYMENT_LABEL);
  protected outgoingPaymentLabel = linkedSignal(() => this.formData().outgoingPaymentLabel ?? DEFAULT_OUTGOING_PAYMENT_LABEL);
  protected incomingPaymentLabelI18n = computed(() => ({
    name: 'incomingPaymentLabel', label: this.i18n().incoming_payment_label(),
    placeholder: this.i18n().incoming_payment_label_placeholder(), helper: this.i18n().incoming_payment_label_helper()
  } as TextInputI18n));
  protected outgoingPaymentLabelI18n = computed(() => ({
    name: 'outgoingPaymentLabel', label: this.i18n().outgoing_payment_label(),
    placeholder: this.i18n().outgoing_payment_label_placeholder(), helper: this.i18n().outgoing_payment_label_helper()
  } as TextInputI18n));
  protected reminderTemplateId = linkedSignal(() => this.formData().reminderTemplateId ?? '');
  protected reminderFeeAccountKey = linkedSignal(() => this.formData().reminderFeeAccountKey ?? '');
  protected reminderGraceDays = linkedSignal(() => this.formData().reminderGraceDays ?? 10);
  protected reminderDueDays = linkedSignal(() => this.formData().reminderDueDays ?? 14);
  // the model stores Rappen, the inputs show CHF
  protected reminderFee1Chf = computed(() => reminderFeeOf(this.formData(), 1) / 100);
  protected reminderFee2Chf = computed(() => reminderFeeOf(this.formData(), 2) / 100);
  protected reminderFee3Chf = computed(() => reminderFeeOf(this.formData(), 3) / 100);

  // Dunning templates only, but never drop the stored one (same rule as the invoice template).
  protected reminderTemplateChoices = computed(() => {
    const id = this.reminderTemplateId();
    return this.templates()
      .filter(t => t.category === 'dunning' || t.okey === id)
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  });

  protected reminderFeeAccountI18n = computed(() => ({
    name: 'reminderFeeAccountKey', label: this.i18n().reminder_fee_account(), helper: this.i18n().reminder_fee_account_helper()
  } as AccountSelectI18n));

  protected reminderFee1I18n = computed(() => this.feeI18n('reminderFee1', this.i18n().reminder_fee_1()));
  protected reminderFee2I18n = computed(() => this.feeI18n('reminderFee2', this.i18n().reminder_fee_2()));
  protected reminderFee3I18n = computed(() => this.feeI18n('reminderFee3', this.i18n().reminder_fee_3()));

  protected reminderGraceDaysI18n = computed(() => ({
    name: 'reminderGraceDays', label: this.i18n().reminder_grace_days(),
    placeholder: this.i18n().reminder_grace_days_placeholder(), helper: this.i18n().reminder_grace_days_helper()
  } as NumberInputI18n));

  protected reminderDueDaysI18n = computed(() => ({
    name: 'reminderDueDays', label: this.i18n().reminder_due_days(),
    placeholder: this.i18n().reminder_due_days_placeholder(), helper: this.i18n().reminder_due_days_helper()
  } as NumberInputI18n));

  private readonly validationResult = computed(() => accountingConfigValidations(this.formData(), this.tenantId(), ''));
  protected fiscalYearStartErrors = computed(() => this.validationResult().getErrors('fiscalYearStart'));

  protected receivablesAccountKeyErrors = computed(() => this.validationResult().getErrors('receivablesAccountKey'));
  protected invoiceTemplateIdErrors = computed(() => this.validationResult().getErrors('invoiceTemplateId'));
  protected defaultCostCenterKeyErrors = computed(() => this.validationResult().getErrors('defaultCostCenterKey'));
  protected reminderTemplateIdErrors = computed(() => this.validationResult().getErrors('reminderTemplateId'));
  protected reminderFeeAccountKeyErrors = computed(() => this.validationResult().getErrors('reminderFeeAccountKey'));
  protected reminderFee1Errors = computed(() => this.validationResult().getErrors('reminderFee1'));
  protected reminderFee2Errors = computed(() => this.validationResult().getErrors('reminderFee2'));
  protected reminderFee3Errors = computed(() => this.validationResult().getErrors('reminderFee3'));
  protected reminderGraceDaysErrors = computed(() => this.validationResult().getErrors('reminderGraceDays'));
  protected reminderDueDaysErrors = computed(() => this.validationResult().getErrors('reminderDueDays'));
  protected incomingPaymentLabelErrors = computed(() => this.validationResult().getErrors('incomingPaymentLabel'));
  protected outgoingPaymentLabelErrors = computed(() => this.validationResult().getErrors('outgoingPaymentLabel'));

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  protected onInvoiceTemplateChange(event: CustomEvent<SelectChangeEventDetail<string>>): void {
    this.onFieldChange('invoiceTemplateId', event.detail.value ?? '');
  }

  protected onReminderTemplateChange(event: CustomEvent<SelectChangeEventDetail<string>>): void {
    this.onFieldChange('reminderTemplateId', event.detail.value ?? '');
  }

  protected onPaymentAccountsChange(event: CustomEvent<SelectChangeEventDetail<string[]>>): void {
    this.onFieldChange('invoicePaymentAccountKeys', event.detail.value ?? []);
  }

  protected onBillPaymentAccountsChange(event: CustomEvent<SelectChangeEventDetail<string[]>>): void {
    this.onFieldChange('billPaymentAccountKeys', event.detail.value ?? []);
  }

  /** CHF from the input → Rappen in the model, converted here once; more than two decimals stay a fraction the suite rejects (legacy docs: start from the defaults). */
  protected onReminderFeeChange(level: number, chf: number): void {
    const fees = [1, 2, 3].map(l => reminderFeeOf(this.formData(), l));
    fees[level - 1] = reminderFeeRappen(chf);
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, reminderFees: fees }));
  }

  private feeI18n(name: string, label: string): NumberInputI18n {
    return { name, label, placeholder: this.i18n().reminder_fee_placeholder(), helper: this.i18n().reminder_fee_helper() } as NumberInputI18n;
  }

  protected onFieldChange(fieldName: string, fieldValue: string | number | string[]): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
