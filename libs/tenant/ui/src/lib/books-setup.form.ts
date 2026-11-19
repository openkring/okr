import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular';

import {
  ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import {
  BOOKS_NAME_MAX_LENGTH, BOOKS_SETUP_BACKENDS, BOOKS_SETUP_VAT_METHODS, BOOKS_SETUP_VAT_PERIODS,
  booksSetupValidations, type BooksSetupInput, type FeaturePickerI18n,
} from '@okr/tenant-util';

/** Longest books id `BOOKS_ID_PATTERN` admits — kept in step with the rule the suite enforces. */
const BOOKS_ID_MAX_LENGTH = 32;

/** The answers the Buchhaltung needs before its menu can show anything. The parent modal drives the setup. */
@Component({
  selector: 'okr-books-setup-form',
  standalone: true,
  imports: [TextInput, NumberInput, StringSelect, ErrorNote, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} } ion-note { display: block; padding: 12px 16px 0; }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-note class="ion-text-wrap">{{ i18n().books_intro() }}</ion-note>
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="booksIdI18n()" [value]="formData().booksId"
                    (valueChange)="onFieldChange('booksId', $event)"
                    [autofocus]="true" [maxLength]="booksIdLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="booksIdErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="formData().name"
                    (valueChange)="onFieldChange('name', $event)"
                    [maxLength]="nameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="backendI18n()" [selectedString]="formData().backend"
                    (selectedStringChange)="onFieldChange('backend', $event)"
                    [stringList]="backends" [labels]="backendLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="backendErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="fiscalI18n()" [value]="formData().fiscalYearStart"
                    (valueChange)="onFieldChange('fiscalYearStart', $event)"
                    [integer]="true" [min]="1" [max]="12" [maxLength]="2" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="fiscalErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="vatMethodI18n()" [selectedString]="formData().vatMethod"
                    (selectedStringChange)="onFieldChange('vatMethod', $event)"
                    [stringList]="vatMethods" [labels]="vatMethodLabels()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="vatMethodErrors()" />
                </ion-col>
                @if (formData().vatMethod !== 'exempt') {
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="vatPeriodI18n()" [selectedString]="formData().vatPeriod"
                      (selectedStringChange)="onFieldChange('vatPeriod', $event)"
                      [stringList]="vatPeriods" [labels]="vatPeriodLabels()" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="vatPeriodErrors()" />
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
export class BooksSetupForm {
  // inputs
  public readonly i18n = input.required<FeaturePickerI18n>();
  public formData = model.required<BooksSetupInput>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly setupForm = form(this.formData, (path) => validateVestTree(path, booksSetupValidations as any));
  private readonly validationResult = vestErrors(this.setupForm);

  constructor() {
    effect(() => this.valid.emit(this.setupForm().valid()));
  }

  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly booksIdLength = BOOKS_ID_MAX_LENGTH;
  protected readonly nameLength = BOOKS_NAME_MAX_LENGTH;

  protected readonly backends = [...BOOKS_SETUP_BACKENDS] as string[];
  protected readonly vatMethods = [...BOOKS_SETUP_VAT_METHODS] as string[];
  protected readonly vatPeriods = [...BOOKS_SETUP_VAT_PERIODS] as string[];

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected readonly booksIdErrors = computed(() => this.validationResult().getErrors('booksId'));
  protected readonly nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected readonly backendErrors = computed(() => this.validationResult().getErrors('backend'));
  protected readonly fiscalErrors = computed(() => this.validationResult().getErrors('fiscalYearStart'));
  protected readonly vatMethodErrors = computed(() => this.validationResult().getErrors('vatMethod'));
  protected readonly vatPeriodErrors = computed(() => this.validationResult().getErrors('vatPeriod'));

  protected readonly booksIdI18n = computed(() => ({
    name: 'booksId', label: this.i18n().books_id_label(), placeholder: '', helper: this.i18n().books_id_helper(),
  } as TextInputI18n));
  protected readonly nameI18n = computed(() => ({
    name: 'name', label: this.i18n().books_name_label(), placeholder: '', helper: this.i18n().books_name_helper(),
  } as TextInputI18n));
  protected readonly backendI18n = computed((): StringSelectI18n => ({ name: 'backend', label: this.i18n().books_backend_label() }));
  protected readonly fiscalI18n = computed((): NumberInputI18n => ({
    name: 'fiscalYearStart', label: this.i18n().books_fiscal_label(), placeholder: '', helper: this.i18n().books_fiscal_helper(),
  }));
  protected readonly vatMethodI18n = computed((): StringSelectI18n => ({ name: 'vatMethod', label: this.i18n().books_vat_method_label() }));
  protected readonly vatPeriodI18n = computed((): StringSelectI18n => ({ name: 'vatPeriod', label: this.i18n().books_vat_period_label() }));

  protected readonly backendLabels = computed(() => [this.i18n().books_backend_native(), this.i18n().books_backend_bexio()]);
  protected readonly vatMethodLabels = computed(() => [
    this.i18n().books_vat_exempt(), this.i18n().books_vat_effective(), this.i18n().books_vat_net_tax_rate(), this.i18n().books_vat_flat_rate(),
  ]);
  protected readonly vatPeriodLabels = computed(() => [
    this.i18n().books_period_quarterly(), this.i18n().books_period_semi_annual(), this.i18n().books_period_monthly(),
  ]);

  protected onFieldChange(fieldName: keyof BooksSetupInput, fieldValue: string | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
