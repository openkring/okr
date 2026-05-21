import { Component, computed, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { OwnershipModel, RoleName, UserModel } from '@bk2/shared-models';
import { DEFAULT_CURRENCY } from '@bk2/shared-constants';
import { Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';

import { ownershipValidations } from '@bk2/relationship-ownership-util';

@Component({
  selector: 'bk-ownership-form',
  standalone: true,
  imports: [
    vestForms,
    Chips, NotesInput, DateInput, TextInput, NumberInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form scVestForm 
      [formValue]="formData()"
      (formValueChange)="onFormChange($event)"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
    >
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if(hasRole('admin')) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <!---------------------------------------------------
                OWNER: PERSON or ORGANISATION 
                --------------------------------------------------->
                @if(ownerModelType() === 'person') {
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="ownerName1I18n()" [value]="ownerName1()" [readOnly]="true" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="ownerName2I18n()" [value]="ownerName2()" [readOnly]="true" />
                  </ion-col>
                } @else {
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="ownerName2I18n()" [value]="ownerName2()" [readOnly]="true" />
                  </ion-col>
                }
              </ion-row>

              <!---------------------------------------------------
              OWNERSHIP
              --------------------------------------------------->
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-date-input [i18n]="validFromI18n()" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [readOnly]="isReadOnly()" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <bk-date-input [i18n]="validToI18n()" [storeDate]="validTo()" (storeDateChange)="onFieldChange('validTo', $event)" [readOnly]="isReadOnly()" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <bk-number-input [i18n]="priceI18n()" [value]="amount()" (valueChange)="onFieldChange('amount', $event)" [maxLength]=6 [readOnly]="isReadOnly()" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="currencyI18n()" [value]="currency()" (valueChange)="onFieldChange('currency', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
        <!---------------------------------------------------
        TAG, NOTES 
        --------------------------------------------------->
        @if(hasRole('privileged') || hasRole('resourceAdmin')) {
          <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
    
        @if(hasRole('admin')) {
          <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `
})
export class OwnershipForm {
  // i18n
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    bkey_label: PFX + 'bkey.label',
    bkey_placeholder: PFX + 'bkey.placeholder',
    bkey_helper: PFX + 'bkey.helper',
    ownerName1_label: PFX + 'ownerName1.label',
    ownerName1_placeholder: PFX + 'ownerName1.placeholder',
    ownerName1_helper: PFX + 'ownerName1.helper',
    ownerName2_label: PFX + 'ownerName2.label',
    ownerName2_placeholder: PFX + 'ownerName2.placeholder',
    ownerName2_helper: PFX + 'ownerName2.helper',
    currency_label: PFX + 'currency.label',
    currency_placeholder: PFX + 'currency.placeholder',
    currency_helper: PFX + 'currency.helper',
    price_label: PFX + 'price.label',
    price_placeholder: PFX + 'price.placeholder',
    price_helper: PFX + 'price.helper',
    notes_label: PFX + 'notes.label',
    notes_placeholder: PFX + 'notes.placeholder',
    validFrom_label: PFX + 'validFrom.label', validFrom_placeholder: PFX + 'validFrom.placeholder', validFrom_helper: PFX + 'validFrom.helper',
    validTo_label:   PFX + 'validTo.label',   validTo_placeholder:   PFX + 'validTo.placeholder',   validTo_helper:   PFX + 'validTo.helper',
  });
  protected bkeyI18n = computed(() => ({ name: 'bkey', label: this.fieldI18n.bkey_label(), placeholder: this.fieldI18n.bkey_placeholder(), helper: this.fieldI18n.bkey_helper() } as TextInputI18n));
  protected ownerName1I18n = computed(() => ({ name: 'ownerName1', label: this.fieldI18n.ownerName1_label(), placeholder: this.fieldI18n.ownerName1_placeholder(), helper: this.fieldI18n.ownerName1_helper() } as TextInputI18n));
  protected ownerName2I18n = computed(() => ({ name: 'ownerName2', label: this.fieldI18n.ownerName2_label(), placeholder: this.fieldI18n.ownerName2_placeholder(), helper: this.fieldI18n.ownerName2_helper() } as TextInputI18n));
  protected currencyI18n = computed(() => ({ name: 'currency', label: this.fieldI18n.currency_label(), placeholder: this.fieldI18n.currency_placeholder(), helper: this.fieldI18n.currency_helper() } as TextInputI18n));
  protected priceI18n = computed(() => ({ name: 'price', label: this.fieldI18n.price_label(), placeholder: this.fieldI18n.price_placeholder(), helper: this.fieldI18n.price_helper() } as NumberInputI18n));
  protected notesI18n = computed(() => ({ name: 'notes', label: this.fieldI18n.notes_label(), placeholder: this.fieldI18n.notes_placeholder() } as NotesInputI18n));
  protected validFromI18n = computed(() => ({ name: 'validFrom', label: this.fieldI18n.validFrom_label(), placeholder: this.fieldI18n.validFrom_placeholder(), helper: this.fieldI18n.validFrom_helper() } as DateInputI18n));
  protected validToI18n = computed(() => ({ name: 'validTo', label: this.fieldI18n.validTo_label(), placeholder: this.fieldI18n.validTo_placeholder(), helper: this.fieldI18n.validTo_helper() } as DateInputI18n));

  // inputs
  public readonly formData = model.required<OwnershipModel>();
  public readonly currentUser = input<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = ownershipValidations;
  private readonly validationResult = computed(() => ownershipValidations(this.formData(), this.tenantId(), this.allTags()));
  protected readonly errors = signal<Record<string, string>>({ });
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected ownerName1 = linkedSignal(() => this.formData().ownerName1 ?? ''); 
  protected ownerName2 = linkedSignal(() => this.formData().ownerName2 ?? ''); 
  protected ownerModelType = linkedSignal(() => this.formData().ownerModelType ?? 'person');
  protected validFrom = linkedSignal(() => this.formData().validFrom ?? '');
  protected validTo = linkedSignal(() => this.formData().validTo ?? '');
  protected price = linkedSignal(() => this.formData().price);
  protected amount = linkedSignal(() => this.price()?.amount ?? 0);
  protected currency = linkedSignal(() => this.price()?.currency ?? DEFAULT_CURRENCY);
  protected tags = linkedSignal(() => this.formData().tags ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected bkey = computed(() => this.formData().bkey ?? '');

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: OwnershipModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('OwnershipForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('OwnershipForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
