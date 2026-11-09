// libs/finance/collection/ui/src/lib/auto-top-up.form.ts
import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow } from '@ionic/angular';

import { AmountInput, AmountInputI18n, Checkbox, CheckboxI18n, ErrorNote } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { AutoTopUpFormModel, autoTopUpValidations, CollectionI18n, topUpBounds } from '@okr/finance-collection-util';

/**
 * The auto top-up settings: on/off, the threshold and the amount (both Rappen). Without a saved payment method the
 * fields stay read-only and a hint says why. The parent modal drives saving.
 */
@Component({
  selector: 'okr-auto-top-up-form',
  standalone: true,
  imports: [Checkbox, AmountInput, ErrorNote, IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if (!hasPaymentMethod()) {
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none">
                      <ion-note color="warning" class="ion-text-wrap">{{ i18n().autotopup_no_method() }}</ion-note>
                    </ion-item>
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12">
                  <okr-checkbox [i18n]="enabledI18n()" [checked]="enabled()" (checkedChange)="onFieldChange('enabled', $event)"
                    [toggle]="true" [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-amount-input [i18n]="thresholdI18n()" [value]="threshold()" (valueChange)="onFieldChange('threshold', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="thresholdErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-amount-input [i18n]="amountI18n()" [value]="amount()" (valueChange)="onFieldChange('amount', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="amountErrors()" [params]="amountBounds" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class AutoTopUpForm {
  // inputs
  public readonly i18n = input.required<CollectionI18n>();
  public formData = model.required<AutoTopUpFormModel>();
  /** false: no saved payment method, so auto top-up cannot be switched on (setAutoTopUp would refuse it) */
  public readonly hasPaymentMethod = input(false);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation; the notes read the same run back
  protected readonly autoTopUpForm = form(this.formData, (path) => validateVestTree(path, autoTopUpValidations));
  private readonly validationResult = vestErrors(this.autoTopUpForm);
  protected readonly thresholdErrors = computed(() => this.validationResult().getErrors('threshold'));
  protected readonly amountErrors = computed(() => this.validationResult().getErrors('amount'));

  constructor() {
    effect(() => this.valid.emit(this.autoTopUpForm().valid()));
  }

  /** fills `{min}` / `{max}` in the amount messages from MIN_TOPUP / MAX_TOPUP */
  protected readonly amountBounds = topUpBounds();

  // field accessors (coalesced: a subscription doc may predate autoTopUp)
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()) || !this.hasPaymentMethod());
  protected readonly enabled = computed(() => this.formData()?.enabled ?? false);
  protected readonly threshold = computed(() => this.formData()?.threshold ?? 0);
  protected readonly amount = computed(() => this.formData()?.amount ?? 0);

  // i18n for the shared/ui primitives
  protected readonly enabledI18n = computed(() => ({
    name: 'autoTopUpEnabled', label: this.i18n().autotopup_enabled_label(), helper: this.i18n().autotopup_enabled_helper(),
  } as CheckboxI18n));
  protected readonly thresholdI18n = computed(() => ({
    name: 'autoTopUpThreshold', label: this.i18n().autotopup_threshold_label(),
  } as AmountInputI18n));
  protected readonly amountI18n = computed(() => ({
    name: 'autoTopUpAmount', label: this.i18n().autotopup_amount_label(),
  } as AmountInputI18n));

  protected onFieldChange(fieldName: keyof AutoTopUpFormModel, fieldValue: boolean | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
