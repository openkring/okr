import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import {
  IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonRow
} from '@ionic/angular/standalone';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountModel, CategoryListModel, FeeFlag, FeePositionRule, FeeRule, FeeSource, VatCodeModel } from '@okr/shared-models';
import {
  CategorySelect, Checkbox, CheckboxI18n, ErrorNote, NumberInput, NumberInputI18n, TextInput, TextInputI18n
} from '@okr/shared-ui';
import { coerceBoolean, getItemLabel } from '@okr/shared-util-core';
import { TranslatePipe } from '@okr/shared-i18n';
import { validateVestTree } from '@okr/shared-util-angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import {
  AccountingI18n, feePositionValidations,
  getFeeCategoryListCategory, getFeeFlagCategory, getFeePositionTypeCategory, getFeePositionUsageCategory,
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
    ErrorNote, TextInput, NumberInput, CategorySelect, Checkbox, AccountSelect, AsyncPipe, TranslatePipe,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonList, IonListHeader, IonItem, IonLabel, IonButton, IonNote
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .helper { display: block; font-size: 0.8rem; padding: 4px 16px 0; }
    .price-table ion-item { --min-height: 32px; font-size: 0.9rem; }
  `],
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
                    <okr-cat-select [category]="categoryListCategory()" [selectedItemName]="effectiveCategoryList()"
                      (selectedItemNameChange)="onCategoryListChange($event)"
                      [fieldStyle]="true" [label]="i18n().feeSchedule_position_categoryList_label()"
                      [showIcons]="false" [readOnly]="isReadOnly()" />
                    <ion-note class="helper">{{ i18n().feeSchedule_position_categoryList_helper() }}</ion-note>
                    <okr-error-note [errors]="categoryListErrors()" />
                  </ion-col>
                }
                @if (source() === 'flag') {
                  <ion-col size="12" size-md="6">
                    <okr-cat-select [category]="flagCategory()" [selectedItemName]="flag()"
                      (selectedItemNameChange)="onFieldChange('flag', $event)"
                      [fieldStyle]="true" [label]="i18n().feeSchedule_position_flag_label()"
                      [showIcons]="false" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="flagErrors()" />
                  </ion-col>
                }
                @if (source() === 'rule') {
                  <ion-col size="12" size-md="6">
                    <okr-cat-select [category]="ruleCategory()" [selectedItemName]="rule()"
                      (selectedItemNameChange)="onFieldChange('rule', $event)"
                      [fieldStyle]="true" [label]="i18n().feeSchedule_position_rule_label()"
                      [showIcons]="false" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="ruleErrors()" />
                  </ion-col>
                }
              </ion-row>

              @if (source() === 'category') {
                <ion-row>
                  <ion-col size="12">
                    <!-- read-only: prices live on the category list, the schedule only points at it -->
                    <ion-list lines="none" class="price-table">
                      <ion-list-header>
                        <ion-label>{{ i18n().feeSchedule_position_categoryList_prices() }}</ion-label>
                        @if (selectedCategoryListModel(); as list) {
                          <ion-button fill="clear" size="small" (click)="editCategoryList.emit(list)">
                            {{ i18n().feeSchedule_position_categoryList_edit() }}
                          </ion-button>
                        }
                      </ion-list-header>
                      @for (item of selectedCategoryListModel()?.items ?? []; track item.name) {
                        <ion-item>
                          <ion-label>{{ itemLabel(item.name) | translate | async }}</ion-label>
                          <ion-label slot="end" class="ion-text-end">{{ item.price ?? 0 }}</ion-label>
                        </ion-item>
                      }
                    </ion-list>
                  </ion-col>
                </ion-row>
              }

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

              @if (source() !== 'rule') {
                <ion-row>
                  <ion-col size="12">
                    <okr-checkbox [i18n]="proRataI18n()" [checked]="proRata()" (checkedChange)="onProRataChange($event)"
                      [showHelper]="true" [readOnly]="isReadOnly()" />
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
  public readonly categoryLists = input<CategoryListModel[]>([]);
  /** the owner org's own price list (`OrgModel.membershipCategoryKey`), used when `categoryList` is empty */
  public readonly defaultCategoryList = input('mcat');
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly editCategoryList = output<CategoryListModel>();

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
  protected flagErrors = computed(() => this.validationResult().getErrors('flag'));
  protected ruleErrors = computed(() => this.validationResult().getErrors('rule'));
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
  // An empty `categoryList` means "the org's own list" — it then follows the org if that changes.
  // Only an override (e.g. mcat_srv for the SRV fee) is stored.
  protected readonly effectiveCategoryList = computed(() => this.categoryList() || this.defaultCategoryList());
  protected readonly categoryListCategory = computed(() =>
    getFeeCategoryListCategory(this.tenantId(), this.categoryLists(), this.effectiveCategoryList()));
  protected readonly selectedCategoryListModel = computed(() =>
    this.categoryLists().find(list => list.name === this.effectiveCategoryList()));
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

  protected readonly proRata = computed(() => this.formData()?.proRata === true);
  protected readonly proRataI18n = computed(() => ({
    name: 'proRata',
    label: this.i18n().feeSchedule_position_proRata_label(),
    helper: this.i18n().feeSchedule_position_proRata_helper()
  } as CheckboxI18n));

  /** spec 1.79 §3.5 — bill this position by months of membership in the entry/exit year */
  protected onProRataChange(value: boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, proRata: value }));
  }

  protected onFieldChange(fieldName: string, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onCategoryListChange(name: string): void {
    this.onFieldChange('categoryList', name === this.defaultCategoryList() ? '' : name);
  }

  /** the item's i18n key (or its plain name for an untranslated list), resolved in the template */
  protected itemLabel(itemName: string): string {
    const list = this.selectedCategoryListModel();
    return list ? getItemLabel(list, itemName) : itemName;
  }

  protected onNumberChange(fieldName: string, fieldValue: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
