import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AddressModel, CategoryListModel, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategorySelect, Checkbox, CheckboxI18n, Chips, EmailInput, EmailInputI18n, ErrorNote, IbanInput, IbanInputI18n, NotesInput, NotesInputI18n, PhoneInput, PhoneInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_ADDRESS_CHANNEL, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

import { SwissCitySearch } from '@bk2/subject-swisscities-ui';
import { addressValidations, AddressesI18n } from '@bk2/subject-address-util';

@Component({
  selector: 'bk-address-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelect, TextInput, Checkbox, SwissCitySearch, NotesInput,
    EmailInput, PhoneInput, IbanInput, ErrorNote, Chips,
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
          <!---------------------------------------------------
            CHANNEL, USAGE, VALUE 
            --------------------------------------------------->
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="addressChannels()!" [selectedItemName]="addressChannel()" (selectedItemNameChange)="onFieldChange('addressChannel', $event)" [withAll]="false" [showHelper]="true" [readOnly]="isReadOnly()" />
            </ion-col>

            @if(addressChannel() === 'custom') {
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="addressChannelLabelI18n()" [value]="addressChannelLabel()" (valueChange)="onFieldChange('addressChannelLabel', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="channelLabelError()" />                                                                                                                     
              </ion-col>
            }
          </ion-row>

          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="addressUsages()!" [selectedItemName]="addressUsage()" (selectedItemNameChange)="onFieldChange('addressUsage', $event)" [withAll]="false" [showHelper]="true" [readOnly]="isReadOnly()" />
            </ion-col>

            @if(addressUsage() === 'custom') {
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="addressUsageLabelI18n()" [value]="addressUsageLabel()" (valueChange)="onFieldChange('addressUsageLabel', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="usageLabelError()" />                                                                                                                     
              </ion-col>
            }
          </ion-row>

          @switch (addressChannel()) {
            @case ('email') {
              <ion-row>
                <ion-col size="12">
                  <bk-email [i18n]="emailI18n()" [value]="email()" (valueChange)="onFieldChange('email', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="emailError()" />                                                                                                                     
                </ion-col>
              </ion-row>
            }
            @case ('phone') {
              <ion-row>
                <ion-col size="12"> 
                  <bk-phone [i18n]="phoneI18n()" [value]="phone()" (valueChange)="onFieldChange('phone', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="phoneError()" />                                                                                                                     
                </ion-col>
              </ion-row>
            }
            @case ('postal') {
              <ion-row>
                <ion-col size="8" size-md="9">
                  <bk-text-input [i18n]="streetNameI18n()" [value]="streetName()" (valueChange)="onFieldChange('streetName', $event)" [readOnly]="isReadOnly()" autocomplete="street-address" />
                  <bk-error-note [errors]="streetNameError()" />                                                                                                                     
                </ion-col>
                <ion-col size="4" size-md="3">
                  <bk-text-input [i18n]="streetNumberI18n()" [value]="streetNumber()" (valueChange)="onFieldChange('streetNumber', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="streetNumberError()" />                                                                                                                     
                </ion-col>

                <ion-col size="12">
                  <bk-text-input [i18n]="addressValue2I18n()" [value]="addressValue2()" (valueChange)="onFieldChange('addressValue2', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              
              @if(!isReadOnly()) {
                <bk-swisscity-search (citySelected)="onCitySelected($event)" />
              }

              <ion-row>
                <ion-col size="12" size-md="3">
                <bk-text-input [i18n]="countryCodeI18n()" [value]="countryCode()" (valueChange)="onFieldChange('countryCode', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
        
                <ion-col size="12" size-md="3">
                  <bk-text-input [i18n]="zipCodeI18n()" [value]="zipCode()" (valueChange)="onFieldChange('zipCode', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="cityI18n()" [value]="city()" (valueChange)="onFieldChange('city', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
            @case ('bankaccount') {
              <ion-row>
                <ion-col size="12">
                  <bk-iban [i18n]="ibanI18n()" [value]="iban()" (valueChange)="onFieldChange('iban', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="ibanError()" />                                                                                                                     
                </ion-col>
              </ion-row>
              @if(hasRole('admin')) {
                <ion-row>
                  <ion-col size="12">
                    <bk-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="isReadOnly()" />
                    <bk-error-note [errors]="urlError()" />                                                                                                                     
                  </ion-col>
                </ion-row>
              }
            }
            @default {
              <ion-row>
                <ion-col size="12">
                  <bk-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="urlError()" />                                                                                                                     
                </ion-col>
              </ion-row>
            }
          }

          <!---------------------------------------------------
            OTHER 
            --------------------------------------------------->
          <ion-row>
            @if(isFavorable()) {
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="isFavoriteI18n()" [checked]="isFavorite()" (checkedChange)="onFieldChange('isFavorite', $event)" [readOnly]="isReadOnly()" />
              </ion-col>  
            }

            @if(isFavorite() === false && addressChannel() === 'email') {
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="isCcI18n()" [checked]="isCc()" (checkedChange)="onFieldChange('isCc', $event)" [readOnly]="isReadOnly()" />
              </ion-col>  
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(hasRole('privileged') || hasRole('memberAdmin')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" (storedChipsChange)="onFieldChange('tags', $event)"  [readOnly]="isReadOnly()" />
    }
    
    @if(hasRole('admin')) {
      <bk-notes-input [i18n]="notesI18n()" [value]="notes()" [readOnly]="isReadOnly()" />
    }
  </form>
  }
` 
})
export class AddressForm {
  protected bkeyI18n              = computed(() => ({ name: 'bkey',              label: this.i18n().bkey_label(),              placeholder: this.i18n().bkey_placeholder(),              helper: this.i18n().bkey_helper()              } as TextInputI18n));
  protected addressChannelLabelI18n = computed(() => ({ name: 'addressChannelLabel', label: this.i18n().addressChannelLabel_label(), placeholder: this.i18n().addressChannelLabel_placeholder(), helper: this.i18n().addressChannelLabel_helper() } as TextInputI18n));
  protected addressUsageLabelI18n = computed(() => ({ name: 'addressUsageLabel', label: this.i18n().addressUsageLabel_label(), placeholder: this.i18n().addressUsageLabel_placeholder(), helper: this.i18n().addressUsageLabel_helper() } as TextInputI18n));
  protected streetNameI18n        = computed(() => ({ name: 'streetName',        label: this.i18n().streetName_label(),        placeholder: this.i18n().streetName_placeholder(),        helper: this.i18n().streetName_helper()        } as TextInputI18n));
  protected streetNumberI18n      = computed(() => ({ name: 'streetNumber',      label: this.i18n().streetNumber_label(),      placeholder: this.i18n().streetNumber_placeholder(),      helper: this.i18n().streetNumber_helper()      } as TextInputI18n));
  protected addressValue2I18n     = computed(() => ({ name: 'addressValue2',     label: this.i18n().addressValue2_label(),     placeholder: this.i18n().addressValue2_placeholder(),     helper: this.i18n().addressValue2_helper()     } as TextInputI18n));
  protected countryCodeI18n       = computed(() => ({ name: 'countryCode',       label: this.i18n().countryCode_label(),       placeholder: this.i18n().countryCode_placeholder(),       helper: this.i18n().countryCode_helper()       } as TextInputI18n));
  protected zipCodeI18n           = computed(() => ({ name: 'zipCode',           label: this.i18n().zipCode_label(),           placeholder: this.i18n().zipCode_placeholder(),           helper: this.i18n().zipCode_helper()           } as TextInputI18n));
  protected cityI18n              = computed(() => ({ name: 'city',              label: this.i18n().city_label(),              placeholder: this.i18n().city_placeholder(),              helper: this.i18n().city_helper()              } as TextInputI18n));
  protected urlI18n               = computed(() => ({ name: 'url',               label: this.i18n().url_label(),               placeholder: this.i18n().url_placeholder(),               helper: this.i18n().url_helper()               } as TextInputI18n));
  protected ibanI18n              = computed(() => ({ name: 'iban',              label: this.i18n().iban_label(),              placeholder: this.i18n().iban_placeholder(),              helper: this.i18n().iban_helper()              } as IbanInputI18n));
  protected notesI18n             = computed(() => ({ name: 'notes',  label: this.i18n().notes_label(),     placeholder: this.i18n().notes_placeholder()     } as NotesInputI18n));
  protected emailI18n             = computed(() => ({ name: 'email',  label: this.i18n().email_label(),     placeholder: this.i18n().email_placeholder()     } as EmailInputI18n));
  protected phoneI18n             = computed(() => ({ name: 'phone',  label: this.i18n().phone_label(),     placeholder: this.i18n().phone_placeholder()     } as PhoneInputI18n));
  protected isFavoriteI18n        = computed(() => ({ name: 'isFavorite', label: this.i18n().isFavorite_label(), helper: this.i18n().isFavorite_helper() } as CheckboxI18n));
  protected isCcI18n              = computed(() => ({ name: 'isCc',       label: this.i18n().isCc_label(),       helper: this.i18n().isCc_helper()       } as CheckboxI18n));

  // inputs
  public readonly i18n = input.required<AddressesI18n>();
  public readonly formData = model.required<AddressModel>();  
  public readonly currentUser = input<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly addressChannels = input.required<CategoryListModel>();
  public readonly addressUsages = input.required<CategoryListModel>();
  public readonly tenantId = input.required<string>();
  protected readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  
  // validation and errors
  protected readonly suite = addressValidations;
  private readonly validationResult = computed(() => addressValidations(this.formData(), this.tenantId(), this.allTags()));
  protected channelLabelError = computed(() => this.validationResult().getErrors('addressChannelLabel'));
  protected usageLabelError = computed(() => this.validationResult().getErrors('addressUsageLabel'));
  protected emailError = computed(() => this.validationResult().getErrors('email'));
  protected phoneError = computed(() => this.validationResult().getErrors('phone'));
  protected streetNameError = computed(() => this.validationResult().getErrors('streetName'));
  protected streetNumberError = computed(() => this.validationResult().getErrors('streetNumber'));
  protected ibanError = computed(() => this.validationResult().getErrors('iban'));
  protected urlError = computed(() => this.validationResult().getErrors('url'));

  // fields
  protected addressChannel = linkedSignal(() => this.formData()?.addressChannel ?? DEFAULT_ADDRESS_CHANNEL);
  protected addressChannelLabel = linkedSignal(() => this.formData()?.addressChannelLabel ?? '');
  protected addressUsage = linkedSignal(() => this.formData()?.addressUsage ?? (this.formData().parentKey.startsWith('org') ? 'work' : 'home'));
  protected addressUsageLabel = linkedSignal(() => this.formData()?.addressUsageLabel ?? '');
  protected email = linkedSignal(() => this.formData()?.email ?? '');
  protected phone = linkedSignal(() => this.formData()?.phone ?? '');
  protected streetName = linkedSignal(() => this.formData()?.streetName ?? '');
  protected streetNumber = linkedSignal(() => this.formData()?.streetNumber ?? '');
  protected addressValue2 = linkedSignal(() => this.formData()?.addressValue2 ?? '');
  protected countryCode = linkedSignal(() => this.formData()?.countryCode ?? 'CH');
  protected zipCode = linkedSignal(() => this.formData()?.zipCode ?? '');
  protected city = linkedSignal(() => this.formData()?.city ?? '');
  protected url = linkedSignal(() => this.formData()?.url ?? '');
  protected iban = linkedSignal(() => this.formData()?.iban ?? '');
  protected isFavorite = computed(() => this.formData()?.isFavorite ?? false);
  protected isCc = computed(() => this.formData()?.isCc ?? false);
  protected isFavorable = computed(() => this.formData()?.isCc === false);
  protected notes = linkedSignal(() => this.formData()?.notes ?? DEFAULT_NOTES);
  protected tags = linkedSignal(() => this.formData()?.tags ?? DEFAULT_TAGS);
  protected bkey = linkedSignal(() => this.formData()?.bkey ?? '');

   protected swissCity = computed(() => {
    return {
      countryCode: this.countryCode(),
      zipCode: this.zipCode(),
      name: this.city(),
      stateCode: ''
    };
  });

  /******************************* actions *************************************** */
  protected onCitySelected(city: SwissCity): void {
    this.dirty.emit(true);
    this.formData.update(data => ({
      ...data!,
      city: city.name,
      countryCode: city.countryCode,
      zipCode: city.zipCode
    }));
  }

  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: AddressModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('AddressForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('AddressForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}