import { Component, computed, effect, input, linkedSignal, model, output, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { OwnershipModel, RoleName, UserModel } from '@bk2/shared-models';
import { DEFAULT_CURRENCY } from '@bk2/shared-constants';
import { Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';

import { ownershipValidations } from '@bk2/relationship-ownership-util';

export interface OwnershipFormI18n {
  bkey_label: Signal<string>;
  bkey_placeholder: Signal<string>;
  bkey_helper: Signal<string>;
  ownerName1_label: Signal<string>;
  ownerName1_placeholder: Signal<string>;
  ownerName1_helper: Signal<string>;
  ownerName2_label: Signal<string>;
  ownerName2_placeholder: Signal<string>;
  ownerName2_helper: Signal<string>;
  validFrom_label: Signal<string>;
  validFrom_placeholder: Signal<string>;
  validFrom_helper: Signal<string>;
  validTo_label: Signal<string>;
  validTo_placeholder: Signal<string>;
  validTo_helper: Signal<string>;
  price_label: Signal<string>;
  price_placeholder: Signal<string>;
  price_helper: Signal<string>;
  currency_label: Signal<string>;
  currency_placeholder: Signal<string>;
  currency_helper: Signal<string>;
  notes_label: Signal<string>;
  notes_placeholder: Signal<string>;
}

@Component({
  selector: 'bk-ownership-form',
  standalone: true,
  imports: [
    Chips, NotesInput, DateInput, TextInput, NumberInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form novalidate>
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
  // i18n - all translations come from the i18n input
  protected bkeyI18n          = computed(() => ({ name: 'bkey',          label: this.i18n().bkey_label(),          placeholder: this.i18n().bkey_placeholder()} as TextInputI18n));
  protected ownerName1I18n    = computed(() => ({ name: 'ownerName1',    label: this.i18n().ownerName1_label(),    placeholder: this.i18n().ownerName1_placeholder()} as TextInputI18n));
  protected ownerName2I18n    = computed(() => ({ name: 'ownerName2',    label: this.i18n().ownerName2_label(),    placeholder: this.i18n().ownerName2_placeholder()} as TextInputI18n));
  protected validFromI18n     = computed(() => ({ name: 'validFrom',     label: this.i18n().validFrom_label(),     placeholder: this.i18n().validFrom_placeholder()} as DateInputI18n));
  protected validToI18n       = computed(() => ({ name: 'validTo',       label: this.i18n().validTo_label(),       placeholder: this.i18n().validTo_placeholder()} as DateInputI18n));
  protected priceI18n         = computed(() => ({ name: 'price',         label: this.i18n().price_label(),         placeholder: this.i18n().price_placeholder()} as NumberInputI18n));
  protected currencyI18n      = computed(() => ({ name: 'currency',      label: this.i18n().currency_label(),      placeholder: this.i18n().currency_placeholder()} as TextInputI18n));
  protected notesI18n         = computed(() => ({ name: 'notes',         label: this.i18n().notes_label(),         placeholder: this.i18n().notes_placeholder()} as NotesInputI18n));

  // inputs
  public readonly i18n = input.required<OwnershipFormI18n>();
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

  // validation
  private readonly validationResult = computed(() => ownershipValidations(this.formData(), this.tenantId(), this.allTags()));

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

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
