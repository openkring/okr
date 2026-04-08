import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AddressModel, CategoryListModel, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, CheckboxComponent, ChipsComponent, EmailInputComponent, ErrorNoteComponent, IbanComponent, NotesInputComponent, PhoneInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_ADDRESS_CHANNEL, DEFAULT_ADDRESS_USAGE, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

import { SwissCitySearchComponent } from '@bk2/subject-swisscities-ui';
import { addressValidations } from '@bk2/subject-address-util';

@Component({
  selector: 'bk-address-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelectComponent, TextInputComponent, CheckboxComponent, SwissCitySearchComponent, NotesInputComponent,
    EmailInputComponent, PhoneInputComponent, IbanComponent, ErrorNoteComponent, ChipsComponent,
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
                <bk-text-input name="bkey" [value]="bkey()" label="bkey" [readOnly]="true" [copyable]="true" />
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
                <bk-text-input name="addressChannelLabel" [value]="addressChannelLabel()" (valueChange)="onFieldChange('addressChannelLabel', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
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
                <bk-text-input name="addressUsageLabel" [value]="addressUsageLabel()" (valueChange)="onFieldChange('addressUsageLabel', $event)"  [showHelper]="true" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="usageLabelError()" />                                                                                                                     
              </ion-col>
            }
          </ion-row>

          @switch (addressChannel()) {
            @case ('email') {
              <ion-row>
                <ion-col size="12">
                  <bk-email [value]="email()" (valueChange)="onFieldChange('email', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="emailError()" />                                                                                                                     
                </ion-col>
              </ion-row>
            }
            @case ('phone') {
              <ion-row>
                <ion-col size="12"> 
                  <bk-phone [value]="phone()" (valueChange)="onFieldChange('phone', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="phoneError()" />                                                                                                                     
                </ion-col>
              </ion-row>
            }
            @case ('postal') {
              <ion-row>
                <ion-col size="8" size-md="9">
                  <bk-text-input name="streetName" [value]="streetName()" (valueChange)="onFieldChange('streetName', $event)" [readOnly]="isReadOnly()" autocomplete="street-address" />
                  <bk-error-note [errors]="streetNameError()" />                                                                                                                     
                </ion-col>
                <ion-col size="4" size-md="3">
                  <bk-text-input name="streetNumber" [value]="streetNumber()" (valueChange)="onFieldChange('streetNumber', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="streetNumberError()" />                                                                                                                     
                </ion-col>

                <ion-col size="12">
                  <bk-text-input name="addressValue2" [value]="addressValue2()" (valueChange)="onFieldChange('addressValue2', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              
              @if(!isReadOnly()) {
                <bk-swisscity-search (citySelected)="onCitySelected($event)" />
              }

              <ion-row>
                <ion-col size="12" size-md="3">
                <bk-text-input name="countryCode" [value]="countryCode()" (valueChange)="onFieldChange('countryCode', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
        
                <ion-col size="12" size-md="3">
                  <bk-text-input name="zipCode" [value]="zipCode()" (valueChange)="onFieldChange('zipCode', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                
                <ion-col size="12" size-md="6">
                  <bk-text-input name="city" [value]="city()" (valueChange)="onFieldChange('city', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
            @case ('bankaccount') {
              <ion-row>
                <ion-col size="12">
                  <bk-iban [value]="iban()" (valueChange)="onFieldChange('iban', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="ibanError()" />                                                                                                                     
                </ion-col>
              </ion-row>
              @if(hasRole('admin')) {
                <ion-row>
                  <ion-col size="12">
                    <bk-text-input name="url" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="isReadOnly()" />
                    <bk-error-note [errors]="urlError()" />                                                                                                                     
                  </ion-col>
                </ion-row>
              }
            }
            @default {
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="url" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="isReadOnly()" />
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
                <bk-checkbox name="isFavorite" [checked]="isFavorite()" (checkedChange)="onFieldChange('isFavorite', $event)" [readOnly]="isReadOnly()" />
              </ion-col>  
            }

            @if(isFavorite() === false && addressChannel() === 'email') {
              <ion-col size="12" size-md="6">
                <bk-checkbox name="isCc" [checked]="isCc()" (checkedChange)="onFieldChange('isCc', $event)" [readOnly]="isReadOnly()" />
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
      <bk-notes [value]="notes()" [readOnly]="isReadOnly()" />
    }
  </form>
  }
` 
})
export class AddressFormComponent {  
  // inputs
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