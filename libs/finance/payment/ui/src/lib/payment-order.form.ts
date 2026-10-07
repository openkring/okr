import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AccountModel, PaymentOrderModel } from '@okr/shared-models';
import { DateInput, DateInputI18n, ErrorNote, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { PaymentI18n, paymentOrderValidations } from '@okr/finance-payment-util';

/** Debit account, execution date and delivery method of a payment order. The parent modal drives saving. */
@Component({
  selector: 'okr-payment-order-form',
  standalone: true,
  imports: [AccountSelect, DateInput, StringSelect, ErrorNote, IonCard, IonCardContent, IonGrid, IonRow, IonCol],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="debitAccountI18n()" [accounts]="accounts()" [allowEmpty]="false"
                    [selectedKey]="debitAccountKey()" (selectedKeyChange)="onFieldChange('debitAccountKey', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="debitAccountKeyErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="executionDateI18n()" [storeDate]="executionDate()"
                    (storeDateChange)="onFieldChange('executionDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="executionDateErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="deliveryMethodI18n()" [stringList]="deliveryMethods" [labels]="deliveryMethodLabels()"
                    [selectedString]="deliveryMethod()" (selectedStringChange)="onFieldChange('deliveryMethod', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class PaymentOrderForm {
  // inputs
  public readonly i18n = input.required<PaymentI18n>();
  public formData = model.required<PaymentOrderModel>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly paymentOrderForm = form(this.formData, (path) => validateVestTree(path, paymentOrderValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.paymentOrderForm().valid()));
  }

  protected readonly deliveryMethods = ['pain001_download', 'bexio_api', 'ebics'];
  protected readonly deliveryMethodLabels = computed(() => [
    this.i18n().delivery_pain001(), this.i18n().delivery_bexio(), this.i18n().delivery_ebics(),
  ]);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly debitAccountKey = computed(() => this.formData()?.debitAccountKey ?? '');
  protected readonly executionDate = computed(() => this.formData()?.executionDate ?? '');
  protected readonly deliveryMethod = computed(() => this.formData()?.deliveryMethod ?? 'pain001_download');

  protected readonly debitAccountKeyErrors = computed(() => this.paymentOrderForm.debitAccountKey().errors().map(e => e.message ?? ''));
  protected readonly executionDateErrors = computed(() => this.paymentOrderForm.executionDate().errors().map(e => e.message ?? ''));

  protected readonly debitAccountI18n = computed(() => ({
    name: 'debitAccountKey', label: this.i18n().debit_account_label(), helper: this.i18n().debit_account_helper(),
  } as AccountSelectI18n));
  protected readonly executionDateI18n = computed(() => ({ name: 'executionDate', label: this.i18n().execution_label(), placeholder: '' } as DateInputI18n));
  protected readonly deliveryMethodI18n = computed(() => ({ name: 'deliveryMethod', label: this.i18n().delivery_label() } as StringSelectI18n));

  protected onFieldChange(fieldName: keyof PaymentOrderModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
