import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountModel, FeeFlag, FeePositionRule, FeeRule, FeeSource, VatCodeModel } from '@okr/shared-models';
import {
  CategorySelect, ErrorNote, NumberInput, NumberInputI18n, TextInput, TextInputI18n
} from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import {
  AccountingI18n, feePositionValidations,
  getFeeFlagCategory, getFeePositionTypeCategory, getFeePositionUsageCategory,
  getFeeRuleCategory, getFeeSourceCategory, getVatCodeCategory
} from '@okr/finance-accounting-util';

/**
 * One position of a year's fee schedule (`FeeScheduleEntry.positions[]`). The `source` decides
 * which of the three amount inputs is even meaningful, so `categoryList`, `flag` and `rule` are
 * each shown only for the source they belong to — a rule with a `flag` and a `categoryList` set
 * at once is a rule whose second half is dead data.
 */
@Component({
  selector: 'okr-fee-position-form',
  standalone: true,
  imports: [
    ErrorNote, TextInput, NumberInput, CategorySelect, AccountSelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="keyI18n()" [value]="key()"
                    (valueChange)="onFieldChange('key', $event)"
                    [autofocus]="true" [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="keyErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="labelI18n()" [value]="label()"
                    (valueChange)="onFieldChange('label', $event)"
                    [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="labelErrors()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="usageCategory()" [selectedItemName]="usage()"
                    (selectedItemNameChange)="onFieldChange('usage', $event)"
                    [fieldStyle]="true" [label]="i18n().feeSchedule_position_usage_label()"
                    [showIcons]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="usageErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="typeCategory()" [selectedItemName]="type()"
                    (selectedItemNameChange)="onFieldChange('type', $event)"
                    [fieldStyle]="true" [label]="i18n().feeSchedule_position_type_label()"
                    [showIcons]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="typeErrors()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="sourceCategory()" [selectedItemName]="source()"
                    (selectedItemNameChange)="onFieldChange('source', $event)"
                    [fieldStyle]="true" [label]="i18n().feeSchedule_position_source_label()"
                    [showIcons]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="sourceErrors()" />
                </ion-col>
                @if (source() === 'category') {
                  <ion-col size="12" size-md="6">
                    <!-- the name of an mcat price list; it is data, not a typed name, so no cap -->
                    <okr-text-input [i18n]="categoryListI18n()" [value]="categoryList()"
                      (valueChange)="onFieldChange('categoryList', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="categoryListErrors()" />
                  </ion-col>
                }
                @if (source() === 'flag') {
                  <ion-col size="12" size-md="6">
                    <okr-cat-select [category]="flagCategory()" [selectedItemName]="flag()"
                      (selectedItemNameChange)="onFieldChange('flag', $event)"
                      [fieldStyle]="true" [label]="i18n().feeSchedule_position_flag_label()"
                      [showIcons]="false" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
                @if (source() === 'rule') {
                  <ion-col size="12" size-md="6">
                    <okr-cat-select [category]="ruleCategory()" [selectedItemName]="rule()"
                      (selectedItemNameChange)="onFieldChange('rule', $event)"
                      [fieldStyle]="true" [label]="i18n().feeSchedule_position_rule_label()"
                      [showIcons]="false" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
              </ion-row>

              @if (source() !== 'category') {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-number-input [i18n]="amountI18n()" [value]="amount()"
                      (valueChange)="onNumberChange('amount', $event)"
                      [min]="0" [max]="maxAmount" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="amountErrors()" />
                  </ion-col>
                </ion-row>
              }

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="accountKeyI18n()" [accounts]="accounts()"
                    [selectedKey]="accountKey()"
                    (selectedKeyChange)="onFieldChange('accountKey', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="vatCodeCategory()" [selectedItemName]="vatCodeKey()"
                    (selectedItemNameChange)="onFieldChange('vatCodeKey', $event)"
                    [fieldStyle]="true" [label]="i18n().feeSchedule_position_vatCodeKey_label()"
                    [showIcons]="false" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `
})
export class FeePositionForm {
  /** kept in step with the cap the Vest suite enforces on `key` and `label` */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;
  /** kept in step with the upper bound the Vest suite enforces on `amount` */
  protected readonly maxAmount = 100000;

  // inputs
  public readonly i18n = input.required<AccountingI18n>();
  public formData = model.required<FeePositionRule>();
  public readonly tenantId = input.required<string>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly feePositionForm = form(this.formData, (path) =>
    validateVestTree(path, feePositionValidations as any),
  );

  // per-field Vest errors. validateVestTree calls the suite with the model alone, so this
  // mirrors exactly what drives the form's validity.
  private readonly validationResult = computed(() => feePositionValidations(this.formData()));
  protected keyErrors = computed(() => this.validationResult().getErrors('key'));
  protected labelErrors = computed(() => this.validationResult().getErrors('label'));
  protected usageErrors = computed(() => this.validationResult().getErrors('usage'));
  protected typeErrors = computed(() => this.validationResult().getErrors('type'));
  protected sourceErrors = computed(() => this.validationResult().getErrors('source'));
  protected categoryListErrors = computed(() => this.validationResult().getErrors('categoryList'));
  protected amountErrors = computed(() => this.validationResult().getErrors('amount'));

  constructor() {
    effect(() => this.valid.emit(this.feePositionForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly key = computed(() => this.formData()?.key ?? '');
  protected readonly label = computed(() => this.formData()?.label ?? '');
  protected readonly usage = computed(() => this.formData()?.usage ?? '');
  protected readonly type = computed(() => this.formData()?.type ?? '');
  protected readonly source = computed<FeeSource | ''>(() => this.formData()?.source ?? '');
  protected readonly categoryList = computed(() => this.formData()?.categoryList ?? '');
  protected readonly flag = computed<FeeFlag | ''>(() => this.formData()?.flag ?? '');
  protected readonly rule = computed<FeeRule | ''>(() => this.formData()?.rule ?? '');
  protected readonly amount = computed(() => this.formData()?.amount ?? 0);
  protected readonly accountKey = computed(() => this.formData()?.accountKey ?? '');
  protected readonly vatCodeKey = computed(() => this.formData()?.vatCodeKey ?? '');

  // the closed registries behind the selects
  protected readonly usageCategory = computed(() => getFeePositionUsageCategory(this.tenantId()));
  protected readonly typeCategory = computed(() => getFeePositionTypeCategory(this.tenantId()));
  protected readonly sourceCategory = computed(() => getFeeSourceCategory(this.tenantId()));
  protected readonly flagCategory = computed(() => getFeeFlagCategory(this.tenantId()));
  protected readonly ruleCategory = computed(() => getFeeRuleCategory(this.tenantId()));
  protected readonly vatCodeCategory = computed(() => getVatCodeCategory(this.tenantId(), this.vatCodes()));

  protected keyI18n = computed(() => ({
    name: 'key',
    label: this.i18n().feeSchedule_position_key_label(),
    placeholder: this.i18n().feeSchedule_position_key_placeholder(),
    helper: this.i18n().feeSchedule_position_key_helper()
  } as TextInputI18n));

  protected labelI18n = computed(() => ({
    name: 'label',
    label: this.i18n().feeSchedule_position_label_label(),
    placeholder: this.i18n().feeSchedule_position_label_placeholder(),
    helper: this.i18n().feeSchedule_position_label_helper()
  } as TextInputI18n));

  protected categoryListI18n = computed(() => ({
    name: 'categoryList',
    label: this.i18n().feeSchedule_position_categoryList_label(),
    placeholder: this.i18n().feeSchedule_position_categoryList_placeholder(),
    helper: this.i18n().feeSchedule_position_categoryList_helper()
  } as TextInputI18n));

  protected amountI18n = computed(() => ({
    name: 'amount',
    label: this.i18n().feeSchedule_position_amount_label(),
    placeholder: this.i18n().feeSchedule_position_amount_placeholder(),
    helper: this.i18n().feeSchedule_position_amount_helper()
  } as NumberInputI18n));

  protected accountKeyI18n = computed(() => ({
    name: 'accountKey',
    label: this.i18n().feeSchedule_position_accountKey_label(),
    helper: this.i18n().feeSchedule_position_accountKey_helper()
  } as AccountSelectI18n));

  protected onFieldChange(fieldName: string, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onNumberChange(fieldName: string, fieldValue: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
