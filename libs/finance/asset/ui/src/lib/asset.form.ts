import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AssetCategoryModel, AssetModel, CostCenterModel } from '@okr/shared-models';
import { DateInput, DateInputI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import { ASSET_NAME_LENGTH, AssetI18n, assetValidations } from '@okr/finance-asset-util';

/** Name, number, category, acquisition date, useful life and Kostenstelle of a fixed asset. The parent modal drives saving. */
@Component({
  selector: 'okr-asset-form',
  standalone: true,
  imports: [TextInput, NumberInput, DateInput, StringSelect, ErrorNote, CostCenterSelect, IonCard, IonCardContent, IonGrid, IonRow, IonCol],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="assetNoI18n()" [value]="assetNo()" (valueChange)="onFieldChange('assetNo', $event)"
                    [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="assetNoErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="categoryI18n()" [stringList]="categoryKeys()" [labels]="categoryLabels()"
                    [selectedString]="categoryKey()" (selectedStringChange)="onFieldChange('categoryKey', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="acquisitionDateI18n()" [storeDate]="acquisitionDate()"
                    (storeDateChange)="onFieldChange('acquisitionDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="acquisitionDateErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="usefulLifeI18n()" [value]="usefulLifeMonths()"
                    (valueChange)="onFieldChange('usefulLifeMonths', $event)" [integer]="true" [min]="0" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="usefulLifeMonthsErrors()" />
                </ion-col>
                @if (costCenterEnabled()) {
                  <ion-col size="12" size-md="6">
                    <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenters()" [allowEmpty]="true" [emptyIsFallback]="true"
                      [selectedKey]="costCenter()" (selectedKeyChange)="onFieldChange('costCenter', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class AssetForm {
  // inputs
  public readonly i18n = input.required<AssetI18n>();
  public formData = model.required<AssetModel>();
  public readonly categories = input<AssetCategoryModel[]>([]);
  public readonly costCenters = input<CostCenterModel[]>([]);
  public readonly costCenterEnabled = input(false);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly assetForm = form(this.formData, (path) => validateVestTree(path, assetValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.assetForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on name and assetNo */
  protected readonly nameLength = ASSET_NAME_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly assetNo = computed(() => this.formData()?.assetNo ?? '');
  protected readonly categoryKey = computed(() => this.formData()?.categoryKey ?? '');
  protected readonly acquisitionDate = computed(() => this.formData()?.acquisitionDate ?? '');
  protected readonly usefulLifeMonths = computed(() => this.formData()?.usefulLifeMonths ?? 0);
  protected readonly costCenter = computed(() => this.formData()?.costCenter ?? '');

  protected readonly categoryKeys = computed(() => ['', ...this.categories().map((c) => c.okey)]);
  protected readonly categoryLabels = computed(() => ['—', ...this.categories().map((c) => c.name)]);

  protected readonly nameErrors = computed(() => this.assetForm.name().errors().map(e => e.message ?? ''));
  protected readonly assetNoErrors = computed(() => this.assetForm.assetNo().errors().map(e => e.message ?? ''));
  protected readonly acquisitionDateErrors = computed(() => this.assetForm.acquisitionDate().errors().map(e => e.message ?? ''));
  protected readonly usefulLifeMonthsErrors = computed(() => this.assetForm.usefulLifeMonths().errors().map(e => e.message ?? ''));

  protected readonly nameI18n = computed(() => ({ name: 'name', label: this.i18n().name(), placeholder: '', helper: '' } as TextInputI18n));
  protected readonly assetNoI18n = computed(() => ({ name: 'assetNo', label: this.i18n().number(), placeholder: '', helper: '' } as TextInputI18n));
  protected readonly categoryI18n = computed(() => ({ name: 'categoryKey', label: this.i18n().category() } as StringSelectI18n));
  protected readonly acquisitionDateI18n = computed(() => ({ name: 'acquisitionDate', label: this.i18n().acquisition_date(), placeholder: '' } as DateInputI18n));
  protected readonly usefulLifeI18n = computed(() => ({ name: 'usefulLifeMonths', label: this.i18n().life(), placeholder: '', helper: '' } as NumberInputI18n));
  protected readonly costCenterI18n = computed(() => ({ name: 'costCenter', label: this.i18n().cost_center() } as CostCenterSelectI18n));

  protected onFieldChange(fieldName: keyof AssetModel, fieldValue: string | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
