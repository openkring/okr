import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { NumberInput, NumberInputI18n , ErrorNote} from '@okr/shared-ui';

import { AccountingConfigModel, AccountModel } from '@okr/shared-models';
import { coerceBoolean } from '@okr/shared-util-core';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { AccountingI18n, accountingConfigValidations } from '@okr/finance-accounting-util';

export type { AccountingI18n };

/**
 * The account links of an accounting tenant: which account an expense posts to when no OCR rule
 * matches, and which payables account an employee reimbursement is booked against. Both store an
 * account `okey`; without them the expense→booking posting (1.20) has no fallback account.
 * Plus the fiscal year start month (1 = calendar year), which the period assignment of bank-import
 * and OCR bookings reads.
 */
@Component({
  selector: 'okr-accounting-config-form',
  standalone: true,
  imports: [
    ErrorNote,AccountSelect, NumberInput, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
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
                  <okr-number-input [i18n]="fiscalYearStartI18n()" [value]="fiscalYearStart()"
                    (valueChange)="onFieldChange('fiscalYearStart', $event)"
                    [integer]="true" [min]="1" [max]="12" [maxLength]="2" [inputMode]="'numeric'"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="fiscalYearStartErrors()" />
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
  public readonly tenantId = input.required<string>();
  public readonly i18n = input.required<AccountingI18n>();
  public readonly readOnly = input(true);
  public showForm = input(true);

  public dirty = output<boolean>();
  public valid = output<boolean>();

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected defaultExpenseAccountKey = linkedSignal(() => this.formData().defaultExpenseAccountKey ?? '');
  protected employeePayablesAccountKey = linkedSignal(() => this.formData().employeePayablesAccountKey ?? '');
  // Legacy config docs predate the field; coalesce to the calendar year like the Cloud Functions do.
  protected fiscalYearStart = linkedSignal(() => this.formData().fiscalYearStart ?? 1);

  protected expenseAccountI18n = computed(() => ({
    name: 'defaultExpenseAccountKey', label: this.i18n().expense_account(), helper: this.i18n().expense_account_helper()
  } as AccountSelectI18n));

  protected payablesAccountI18n = computed(() => ({
    name: 'employeePayablesAccountKey', label: this.i18n().payables_account(), helper: this.i18n().payables_account_helper()
  } as AccountSelectI18n));

  protected fiscalYearStartI18n = computed(() => ({
    name: 'fiscalYearStart', label: this.i18n().fiscal_year_start(),
    placeholder: this.i18n().fiscal_year_start_placeholder(), helper: this.i18n().fiscal_year_start_helper()
  } as NumberInputI18n));

  private readonly validationResult = computed(() => accountingConfigValidations(this.formData(), this.tenantId(), ''));
  protected fiscalYearStartErrors = computed(() => this.validationResult().getErrors('fiscalYearStart'));

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  protected onFieldChange(fieldName: string, fieldValue: string | number): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
