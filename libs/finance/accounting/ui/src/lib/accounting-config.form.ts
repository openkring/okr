import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AccountingConfigModel, AccountModel } from '@okr/shared-models';
import { coerceBoolean } from '@okr/shared-util-core';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { AccountingI18n, accountingConfigValidations } from '@okr/finance-accounting-util';

export type { AccountingI18n };

/**
 * The account links of an accounting tenant: which account an expense posts to when no OCR rule
 * matches, and which payables account an employee reimbursement is booked against. Both store an
 * account `okey`; without them the expense→booking posting (1.20) has no fallback account.
 */
@Component({
  selector: 'okr-accounting-config-form',
  standalone: true,
  imports: [AccountSelect, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
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

  protected expenseAccountI18n = computed(() => ({
    name: 'defaultExpenseAccountKey', label: this.i18n().expense_account(), helper: this.i18n().expense_account_helper()
  } as AccountSelectI18n));

  protected payablesAccountI18n = computed(() => ({
    name: 'employeePayablesAccountKey', label: this.i18n().payables_account(), helper: this.i18n().payables_account_helper()
  } as AccountSelectI18n));

  private readonly validationResult = computed(() => accountingConfigValidations(this.formData(), this.tenantId(), ''));

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  protected onFieldChange(fieldName: string, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
