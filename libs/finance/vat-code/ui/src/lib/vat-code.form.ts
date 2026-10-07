import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AccountModel, VatCodeModel } from '@okr/shared-models';
import { DateInput, DateInputI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { VAT_CODE_NAME_LENGTH, VatCodeI18n, vatCodeValidations } from '@okr/finance-vat-code-util';

/** Code, name, rate, direction, booking account and validity of a VAT code. The parent modal drives saving. */
@Component({
  selector: 'okr-vat-code-form',
  standalone: true,
  imports: [TextInput, NumberInput, DateInput, StringSelect, AccountSelect, ErrorNote, IonCard, IonCardContent, IonGrid, IonRow, IonCol],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="codeI18n()" [value]="code()" (valueChange)="onFieldChange('code', $event)"
                    [autofocus]="true" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="codeErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="rateI18n()" [value]="rate()" (valueChange)="onFieldChange('rate', $event)"
                    [min]="0" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="rateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="directionI18n()" [stringList]="directions" [labels]="directionLabels()"
                    [selectedString]="direction()" (selectedStringChange)="onFieldChange('direction', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-account-select [i18n]="accountI18n()" [accounts]="accounts()"
                    [selectedKey]="accountKey()" (selectedKeyChange)="onFieldChange('accountKey', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="validFromI18n()" [storeDate]="validFrom()"
                    (storeDateChange)="onFieldChange('validFrom', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="validFromErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="validToI18n()" [storeDate]="validTo()"
                    (storeDateChange)="onFieldChange('validTo', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="validToErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class VatCodeForm {
  // inputs
  public readonly i18n = input.required<VatCodeI18n>();
  public formData = model.required<VatCodeModel>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly vatCodeForm = form(this.formData, (path) => validateVestTree(path, vatCodeValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.vatCodeForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on code and name */
  protected readonly nameLength = VAT_CODE_NAME_LENGTH;

  protected readonly directions = ['input', 'output'];
  protected readonly directionLabels = computed(() => [this.i18n().direction_input(), this.i18n().direction_output()]);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly code = computed(() => this.formData()?.code ?? '');
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly rate = computed(() => this.formData()?.rate ?? 0);
  protected readonly direction = computed(() => this.formData()?.direction ?? 'output');
  protected readonly accountKey = computed(() => this.formData()?.accountKey ?? '');
  protected readonly validFrom = computed(() => this.formData()?.validFrom ?? '');
  protected readonly validTo = computed(() => this.formData()?.validTo ?? '');

  protected readonly codeErrors = computed(() => this.vatCodeForm.code().errors().map(e => e.message ?? ''));
  protected readonly nameErrors = computed(() => this.vatCodeForm.name().errors().map(e => e.message ?? ''));
  protected readonly rateErrors = computed(() => this.vatCodeForm.rate().errors().map(e => e.message ?? ''));
  protected readonly validFromErrors = computed(() => this.vatCodeForm.validFrom().errors().map(e => e.message ?? ''));
  protected readonly validToErrors = computed(() => this.vatCodeForm.validTo().errors().map(e => e.message ?? ''));

  protected readonly codeI18n = computed(() => ({ name: 'code', label: this.i18n().code_label(), placeholder: '', helper: '' } as TextInputI18n));
  protected readonly nameI18n = computed(() => ({ name: 'name', label: this.i18n().name_label(), placeholder: '', helper: '' } as TextInputI18n));
  protected readonly rateI18n = computed(() => ({ name: 'rate', label: this.i18n().rate_label(), placeholder: '', helper: '' } as NumberInputI18n));
  protected readonly directionI18n = computed(() => ({ name: 'direction', label: this.i18n().direction_label() } as StringSelectI18n));
  protected readonly accountI18n = computed(() => ({
    name: 'accountKey', label: this.i18n().account_label(), helper: this.i18n().account_helper(),
  } as AccountSelectI18n));
  protected readonly validFromI18n = computed(() => ({ name: 'validFrom', label: this.i18n().valid_from_label(), placeholder: '' } as DateInputI18n));
  protected readonly validToI18n = computed(() => ({
    name: 'validTo', label: this.i18n().valid_to_label(), placeholder: '', helper: this.i18n().valid_to_helper(),
  } as DateInputI18n));

  protected onFieldChange(fieldName: keyof VatCodeModel, fieldValue: string | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
