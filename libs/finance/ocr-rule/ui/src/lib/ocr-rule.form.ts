import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { AccountModel, CostCenterModel, VatCodeModel } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import { normalizeParty, OcrRuleFormModel, OcrRuleI18n, ocrRuleValidations } from '@okr/finance-ocr-rule-util';

const USAGES = ['expense', 'invoice', 'paper', 'bill'];

/** Vendor → account mapping used by the OCR pipeline. The parent modal drives saving. */
@Component({
  selector: 'okr-ocr-rule-form',
  standalone: true,
  imports: [TextInput, NumberInput, Checkbox, StringSelect, ErrorNote, AccountSelect, CostCenterSelect, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="partyI18n()" [value]="party()" (valueChange)="onFieldChange('party', $event)"
                    [autofocus]="true" [maxLength]="longNameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="partyErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="usageI18n()" [stringList]="usages" [labels]="usageLabels()"
                    [selectedString]="ocrUsage()" (selectedStringChange)="onFieldChange('ocrUsage', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="aliasI18n()" [value]="aliasText()" (valueChange)="onFieldChange('aliasText', $event)"
                    [maxLength]="descriptionLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="aliasTextErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="accountI18n()" [accounts]="accounts()" [allowEmpty]="true"
                    [selectedKey]="accountKey()" (selectedKeyChange)="onFieldChange('accountKey', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="vatI18n()" [stringList]="vatCodeList()" [labels]="vatCodeLabels()"
                    [selectedString]="vatCode()" (selectedStringChange)="onFieldChange('vatCode', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                @if (costCentersEnabled()) {
                  <ion-col size="12" size-md="6">
                    <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenters()" [allowEmpty]="true" [emptyIsFallback]="true"
                      [selectedKey]="costCenterId()" (selectedKeyChange)="onFieldChange('costCenterId', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="rankI18n()" [value]="rank()" (valueChange)="onFieldChange('rank', $event)"
                    [integer]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="rankErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="activeI18n()" [checked]="active()" (checkedChange)="onFieldChange('active', $event)"
                    [toggle]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class OcrRuleForm {
  // inputs
  public readonly i18n = input.required<OcrRuleI18n>();
  public formData = model.required<OcrRuleFormModel>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly costCenters = input<CostCenterModel[]>([]);
  public readonly costCentersEnabled = input(false);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly ocrRuleForm = form(this.formData, (path) => validateVestTree(path, ocrRuleValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.ocrRuleForm().valid()));
  }

  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly longNameLength = LONG_NAME_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly usages = USAGES;

  protected readonly partyErrors = computed(() => this.ocrRuleForm.party().errors().map(e => e.message ?? ''));
  protected readonly aliasTextErrors = computed(() => this.ocrRuleForm.aliasText().errors().map(e => e.message ?? ''));
  protected readonly rankErrors = computed(() => this.ocrRuleForm.rank().errors().map(e => e.message ?? ''));

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly ocrUsage = computed(() => this.formData()?.ocrUsage ?? 'expense');
  protected readonly party = computed(() => this.formData()?.party ?? '');
  protected readonly aliasText = computed(() => this.formData()?.aliasText ?? '');
  protected readonly accountKey = computed(() => this.formData()?.accountKey ?? '');
  protected readonly vatCode = computed(() => this.formData()?.vatCode ?? '');
  protected readonly costCenterId = computed(() => this.formData()?.costCenterId ?? '');
  protected readonly rank = computed(() => Number(this.formData()?.rank) || 0);
  protected readonly active = computed(() => this.formData()?.active ?? true);

  /** what the matcher will actually compare against — the stored, normalized token */
  protected readonly partyPreview = computed(() => normalizeParty(this.party()) || '—');
  protected readonly aliasPreview = computed(() =>
    this.aliasText().split(',').map(a => normalizeParty(a)).filter(a => a.length > 0).join(', ') || '—');

  // '' first: the VAT code is optional
  protected readonly vatCodeList = computed(() => ['', ...this.vatCodes().map(v => v.code)]);
  protected readonly vatCodeLabels = computed(() => ['—', ...this.vatCodes().map(v => `${v.code} — ${v.name}`)]);
  protected readonly usageLabels = computed(() => [this.i18n().f_usage_expense(), this.i18n().f_usage_invoice(), this.i18n().f_usage_paper(), this.i18n().f_usage_bill()]);

  protected readonly usageI18n = computed(() => ({ name: 'ocrUsage', label: this.i18n().f_usage() } as StringSelectI18n));
  protected readonly partyI18n = computed(() => ({
    name: 'party', label: this.i18n().f_party(), placeholder: '',
    helper: `${this.i18n().f_stored_as()} ${this.partyPreview()}`,
  } as TextInputI18n));
  protected readonly aliasI18n = computed(() => ({
    name: 'aliasText', label: this.i18n().f_aliases(), placeholder: '',
    helper: `${this.i18n().f_stored_as()} ${this.aliasPreview()}`,
  } as TextInputI18n));
  protected readonly accountI18n = computed(() => ({ name: 'accountKey', label: this.i18n().f_account() } as AccountSelectI18n));
  protected readonly vatI18n = computed(() => ({ name: 'vatCode', label: this.i18n().f_vat() } as StringSelectI18n));
  protected readonly costCenterI18n = computed(() => ({ name: 'costCenterId', label: this.i18n().f_cost_center() } as CostCenterSelectI18n));
  protected readonly rankI18n = computed(() => ({ name: 'rank', label: this.i18n().f_rank(), placeholder: '', helper: '' } as NumberInputI18n));
  protected readonly activeI18n = computed(() => ({ name: 'active', label: this.i18n().f_active(), helper: '' } as CheckboxI18n));

  protected onFieldChange(fieldName: keyof OcrRuleFormModel, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
