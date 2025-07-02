import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { vestForms } from 'ngx-vest-forms';
import { IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';

import { AddressChannels, AddressUsages } from '@bk2/shared/categories';
import { AddressChannel, AddressUsage, SwissCity, UserModel, RoleName } from '@bk2/shared/models';
import { CategoryComponent, CheckboxComponent, EmailInputComponent, ErrorNoteComponent, IbanComponent, PhoneInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { debugFormErrors, hasRole } from '@bk2/shared/util-core';

import { SwissCitySearchComponent } from '@bk2/swisscities/ui';

import { AddressFormModel, addressFormModelShape, addressFormValidations } from '@bk2/address/util';

@Component({
  selector: 'bk-address-form',
  imports: [
    vestForms,
    CategoryComponent, TextInputComponent, CheckboxComponent, SwissCitySearchComponent,
    EmailInputComponent, PhoneInputComponent, IbanComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol
],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-grid>
      <!---------------------------------------------------
        CHANNEL, USAGE, VALUE 
        --------------------------------------------------->
      <ion-row>
        <ion-col size="12" size-md="6">
          <bk-cat name="channelType" [value]="channelType()" [categories]="addressChannels" [showHelper]="true" (changed)="onChange('channelType', $event)" />
        </ion-col>

        @if(channelType() === addressChannel.Custom) {
          <ion-col size="12" size-md="6">
            <bk-text-input name="channelLabel" [value]="channelLabel()" [showHelper]="true" />
            <bk-error-note [errors]="channelLabelError()" />                                                                                                                     
          </ion-col>
        }
      </ion-row>

      <ion-row>
        <ion-col size="12" size-md="6">
          <bk-cat name="usageType" [value]="usageType()" [categories]="addressUsages" [showHelper]="true" (changed)="onChange('usageType', $event)" />
        </ion-col>

        @if(usageType() === addressUsage.Custom) {
          <ion-col size="12" size-md="6">
            <bk-text-input name="usageLabel" [value]="usageLabel()"  [showHelper]="true" (changed)="onChange('usageLabel', $event)" />
            <bk-error-note [errors]="usageLabelError()" />                                                                                                                     
          </ion-col>
        }
      </ion-row>

      @switch (channelType()) {
        @case (addressChannel.Email) {
          <ion-row>
            <ion-col size="12">
              <bk-email [value]="email()" (changed)="onChange('email', $event)" />
              <bk-error-note [errors]="emailError()" />                                                                                                                     
            </ion-col>
          </ion-row>
        }
        @case (addressChannel.Phone) {
          <ion-row>
            <ion-col size="12"> 
              <bk-phone [value]="phone()" (changed)="onChange('phone', $event)" />
              <bk-error-note [errors]="phoneError()" />                                                                                                                     
            </ion-col>
          </ion-row>
        }
        @case (addressChannel.Postal) {
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input name="street" [value]="street()" autocomplete="street-address" (changed)="onChange('street', $event)" />
              <bk-error-note [errors]="streetError()" />                                                                                                                     
            </ion-col>
    
            <ion-col size="12" size-md="6">
              <bk-text-input name="addressValue2" [value]="addressValue2()" (changed)="onChange('addressValue2', $event)" />
            </ion-col>
          </ion-row>
          
          <bk-swisscity-search (citySelected)="onCitySelected($event)" />

          <ion-row>
            <ion-col size="12" size-md="3">
             <bk-text-input name="countryCode" [value]="countryCode()" (changed)="onChange('countryCode', $event)" />
            </ion-col>
    
            <ion-col size="12" size-md="3">
              <bk-text-input name="zipCode" [value]="zipCode()" (changed)="onChange('zipCode', $event)" />
            </ion-col>
            
            <ion-col size="12" size-md="6">
              <bk-text-input name="city" [value]="city()" (changed)="onChange('city', $event)" />
            </ion-col>
          </ion-row>
        }
        @case (addressChannel.BankAccount) {
          <ion-row>
            <ion-col size="12">
              <bk-iban [value]="iban()" (changed)="onChange('iban', $event)" />
              <bk-error-note [errors]="ibanError()" />                                                                                                                     
            </ion-col>
          </ion-row>
        }
        @default {
          <ion-row>
            <ion-col size="12">
              <bk-text-input name="addressValue" [value]="addressValue()" (changed)="onChange('addressValue', $event)" />
              <bk-error-note [errors]="addressValueError()" />                                                                                                                     
            </ion-col>
          </ion-row>
        }
      }

      <!---------------------------------------------------
        OTHER 
        --------------------------------------------------->
      <ion-row>
        @if(isFavorable(vm())) {
          <ion-col size="12" size-md="6">
            <bk-checkbox name="isFavorite" [isChecked]="isFavorite()" (changed)="onChange('isFavorite', $event)" />
          </ion-col>  
        }

        @if(isFavorite() === false && channelType() === addressChannel.Email) {
          <ion-col size="12" size-md="6">
            <bk-checkbox name="isCc" [isChecked]="isCc()" (changed)="onChange('isCc', $event)" />
          </ion-col>  
        }
      </ion-row>
    </ion-grid>
  </form>
` 
})
export class AddressFormComponent {
  protected modalController = inject(ModalController);

  public vm = model.required<AddressFormModel>();
  public currentUser = input<UserModel | undefined>();

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = addressFormValidations;
  protected shape = addressFormModelShape;
  private readonly validationResult = computed(() => addressFormValidations(this.vm()));
  protected channelLabelError = computed(() => this.validationResult().getErrors('channelLabel'));
  protected usageLabelError = computed(() => this.validationResult().getErrors('usageLabel'));
  protected emailError = computed(() => this.validationResult().getErrors('email'));
  protected phoneError = computed(() => this.validationResult().getErrors('phone'));
  protected streetError = computed(() => this.validationResult().getErrors('street'));
  protected ibanError = computed(() => this.validationResult().getErrors('iban'));
  protected addressValueError = computed(() => this.validationResult().getErrors('addressValue'));
  protected swissCity = computed(() => {
    return {
      countryCode: this.countryCode(),
      zipCode: parseInt(this.zipCode()),
      name: this.city(),
      stateCode: ''
    };
  });

  protected channelType = computed(() => this.vm().channelType ?? AddressChannel.Phone);
  protected channelLabel = computed(() => this.vm().channelLabel ?? '');
  protected usageType = computed(() => this.vm().usageType ?? AddressUsage.Home);
  protected usageLabel = computed(() => this.vm().usageLabel ?? '');
  protected addressValue = computed(() => this.vm().addressValue ?? '');
  protected addressValue2 = computed(() => this.vm().addressValue2 ?? '');
  protected email = computed(() => this.vm().email ?? '');
  protected phone = computed(() => this.vm().phone ?? '');
  protected street = computed(() => this.vm().street ?? '');
  protected countryCode = computed(() => this.vm().countryCode ?? 'CH');
  protected zipCode = computed(() => this.vm().zipCode ?? '');
  protected city = computed(() => this.vm().city ?? '');
  protected iban = computed(() => this.vm().iban ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected isFavorite = computed(() => this.vm().isFavorite ?? false);
  protected isCc = computed(() => this.vm().isCc ?? false);

  public addressChannel = AddressChannel;
  public addressUsage = AddressUsage;
  public addressChannels = AddressChannels;
  public addressUsages = AddressUsages;

  public isFavorable(vm: AddressFormModel): boolean {
    return vm.isCc === false && vm.channelType === AddressChannel.Email || vm.channelType === AddressChannel.Phone || vm.channelType === AddressChannel.Postal;
  }

  protected onValueChange(value: AddressFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  // beware/tbd: email: addressValue + email, phone: addressValue + phone, iban: addressValue + iban
  protected onChange(fieldName: string, value: string | string[] | number | boolean): void {
    if (!value) return;
    if (fieldName === 'email') {
      this.vm.update((_vm) => ({..._vm, email: value as string, addressValue: value as string}));
    } else if (fieldName === 'phone') {
      this.vm.update((_vm) => ({..._vm, phone: value as string, addressValue: value as string}));
    } else if (fieldName === 'iban') {
      this.vm.update((_vm) => ({..._vm, iban: value as string, addressValue: value as string}));
    } else {
      this.vm.update((vm) => ({ ...vm, [fieldName]: value }));
    }
    debugFormErrors('AddressForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onCitySelected(city: SwissCity): void {
    this.vm.update((_vm) => ({ ..._vm, city: city.name, countryCode: city.countryCode, zipCode: String(city.zipCode) }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}