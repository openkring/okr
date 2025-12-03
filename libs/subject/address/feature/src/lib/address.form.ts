import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AddressChannels, AddressUsages } from '@bk2/shared-categories';
import { AddressChannel, AddressUsage, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategoryComponent, CheckboxComponent, EmailInputComponent, ErrorNoteComponent, IbanComponent, PhoneInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { SwissCitySearchComponent } from '@bk2/subject-swisscities-ui';

import { ADDRESS_FORM_SHAPE, AddressFormModel, addressFormValidations } from '@bk2/subject-address-util';

@Component({
  selector: 'bk-address-form',
  standalone: true,
  imports: [
    vestForms,
    CategoryComponent, TextInputComponent, CheckboxComponent, SwissCitySearchComponent,
    EmailInputComponent, PhoneInputComponent, IbanComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-grid>
      <!---------------------------------------------------
        CHANNEL, USAGE, VALUE 
        --------------------------------------------------->
      <ion-row>
        <ion-col size="12" size-md="6">
          <bk-cat name="channelType" [value]="channelType()" [categories]="addressChannels" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('channelType', $event)" />
        </ion-col>

        @if(channelType() === addressChannel.Custom) {
          <ion-col size="12" size-md="6">
            <bk-text-input name="channelLabel" [value]="channelLabel()" [showHelper]="true" [readOnly]="isReadOnly()" />
            <bk-error-note [errors]="channelLabelError()" />                                                                                                                     
          </ion-col>
        }
      </ion-row>

      <ion-row>
        <ion-col size="12" size-md="6">
          <bk-cat name="usageType" [value]="usageType()" [categories]="addressUsages" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('usageType', $event)" />
        </ion-col>

        @if(usageType() === addressUsage.Custom) {
          <ion-col size="12" size-md="6">
            <bk-text-input name="usageLabel" [value]="usageLabel()"  [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('usageLabel', $event)" />
            <bk-error-note [errors]="usageLabelError()" />                                                                                                                     
          </ion-col>
        }
      </ion-row>

      @switch (channelType()) {
        @case (addressChannel.Email) {
          <ion-row>
            <ion-col size="12">
              <bk-email [value]="email()" [readOnly]="isReadOnly()" (changed)="onFieldChange('email', $event)" />
              <bk-error-note [errors]="emailError()" />                                                                                                                     
            </ion-col>
          </ion-row>
        }
        @case (addressChannel.Phone) {
          <ion-row>
            <ion-col size="12"> 
              <bk-phone [value]="phone()" [readOnly]="isReadOnly()" (changed)="onFieldChange('phone', $event)" />
              <bk-error-note [errors]="phoneError()" />                                                                                                                     
            </ion-col>
          </ion-row>
        }
        @case (addressChannel.Postal) {
          <ion-row>
            <ion-col size="9">
              <bk-text-input name="streetName" [value]="streetName()" [readOnly]="isReadOnly()" autocomplete="street-address" (changed)="onFieldChange('streetName', $event)" />
              <bk-error-note [errors]="streetNameError()" />                                                                                                                     
            </ion-col>
            <ion-col size="3">
              <bk-text-input name="streetNumber" [value]="streetNumber()" [readOnly]="isReadOnly()" (changed)="onFieldChange('streetNumber', $event)" />
              <bk-error-note [errors]="streetNumberError()" />                                                                                                                     
            </ion-col>

            <ion-col size="12">
              <bk-text-input name="addressValue2" [value]="addressValue2()" [readOnly]="isReadOnly()" (changed)="onFieldChange('addressValue2', $event)" />
            </ion-col>
          </ion-row>
          
          @if(!isReadOnly()) {
            <bk-swisscity-search (citySelected)="onCitySelected($event)" />
          }

          <ion-row>
            <ion-col size="12" size-md="3">
             <bk-text-input name="countryCode" [value]="countryCode()" [readOnly]="isReadOnly()" (changed)="onFieldChange('countryCode', $event)" />
            </ion-col>
    
            <ion-col size="12" size-md="3">
              <bk-text-input name="zipCode" [value]="zipCode()" [readOnly]="isReadOnly()" (changed)="onFieldChange('zipCode', $event)" />
            </ion-col>
            
            <ion-col size="12" size-md="6">
              <bk-text-input name="city" [value]="city()" [readOnly]="isReadOnly()" (changed)="onFieldChange('city', $event)" />
            </ion-col>
          </ion-row>
        }
        @case (addressChannel.BankAccount) {
          <ion-row>
            <ion-col size="12">
              <bk-iban [value]="iban()" [readOnly]="isReadOnly()" (changed)="onFieldChange('iban', $event)" />
              <bk-error-note [errors]="ibanError()" />                                                                                                                     
            </ion-col>
          </ion-row>
          @if(hasRole('admin')) {
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="url" [value]="url()" [readOnly]="isReadOnly()" (changed)="onFieldChange('url', $event)" />
                <bk-error-note [errors]="urlError()" />                                                                                                                     
              </ion-col>
            </ion-row>
          }
        }
        @default {
          <ion-row>
            <ion-col size="12">
              <bk-text-input name="url" [value]="url()" [readOnly]="isReadOnly()" (changed)="onFieldChange('url', $event)" />
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
            <bk-checkbox name="isFavorite" [isChecked]="isFavorite()" [readOnly]="isReadOnly()" (changed)="onFieldChange('isFavorite', $event)" />
          </ion-col>  
        }

        @if(isFavorite() === false && channelType() === addressChannel.Email) {
          <ion-col size="12" size-md="6">
            <bk-checkbox name="isCc" [isChecked]="isCc()" [readOnly]="isReadOnly()" (changed)="onFieldChange('isCc', $event)" />
          </ion-col>  
        }
      </ion-row>
    </ion-grid>
  </form>
` 
})
export class AddressFormComponent {
  protected modalController = inject(ModalController);

  // inputs
  public formData = model.required<AddressFormModel>();
  public currentUser = input<UserModel | undefined>();
  protected readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  
  // validation and errors
  protected readonly suite = addressFormValidations;
  protected shape = ADDRESS_FORM_SHAPE;
  private readonly validationResult = computed(() => addressFormValidations(this.formData()));
  protected channelLabelError = computed(() => this.validationResult().getErrors('channelLabel'));
  protected usageLabelError = computed(() => this.validationResult().getErrors('usageLabel'));
  protected emailError = computed(() => this.validationResult().getErrors('email'));
  protected phoneError = computed(() => this.validationResult().getErrors('phone'));
  protected streetNameError = computed(() => this.validationResult().getErrors('streetName'));
  protected streetNumberError = computed(() => this.validationResult().getErrors('streetNumber'));
  protected ibanError = computed(() => this.validationResult().getErrors('iban'));
  protected urlError = computed(() => this.validationResult().getErrors('url'));

  // fields
  protected channelType = computed(() => this.formData().channelType ?? AddressChannel.Phone);
  protected channelLabel = computed(() => this.formData().channelLabel ?? '');
  protected usageType = computed(() => this.formData().usageType ?? AddressUsage.Home);
  protected usageLabel = computed(() => this.formData().usageLabel ?? '');
  protected email = computed(() => this.formData().email ?? '');
  protected phone = computed(() => this.formData().phone ?? '');
  protected streetName = computed(() => this.formData().streetName ?? '');
  protected streetNumber = computed(() => this.formData().streetNumber ?? '');
  protected addressValue2 = computed(() => this.formData().addressValue2 ?? '');
  protected countryCode = computed(() => this.formData().countryCode ?? 'CH');
  protected zipCode = computed(() => this.formData().zipCode ?? '');
  protected city = computed(() => this.formData().city ?? '');
  protected url = computed(() => this.formData().url ?? '');
  protected iban = computed(() => this.formData().iban ?? '');
  protected tags = computed(() => this.formData().tags ?? '');
  protected isFavorite = computed(() => this.formData().isFavorite ?? false);
  protected isCc = computed(() => this.formData().isCc ?? false);
  protected isFavorable = computed(() => this.formData().isCc === false);
   protected swissCity = computed(() => {
    return {
      countryCode: this.countryCode(),
      zipCode: parseInt(this.zipCode()),
      name: this.city(),
      stateCode: ''
    };
  });

  // passing constants to template
  public addressChannel = AddressChannel;
  public addressUsage = AddressUsage;
  public addressChannels = AddressChannels;
  public addressUsages = AddressUsages;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: AddressFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('AddressForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected onFieldChange(fieldName: string, value: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
    debugFormErrors('AddressForm.onFieldChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected onCitySelected(city: SwissCity): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, city: city.name, countryCode: city.countryCode, zipCode: String(city.zipCode) }));
    debugFormErrors('AddressForm.onCitySelected: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}