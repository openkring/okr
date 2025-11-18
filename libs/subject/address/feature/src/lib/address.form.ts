import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AddressChannels, AddressUsages } from '@bk2/shared-categories';
import { AddressChannel, AddressUsage, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategoryComponent, CheckboxComponent, EmailInputComponent, ErrorNoteComponent, IbanComponent, PhoneInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { SwissCitySearchComponent } from '@bk2/subject-swisscities-ui';

import { AddressFormModel, addressFormModelShape, addressFormValidations } from '@bk2/subject-address-util';

@Component({
  selector: 'bk-address-form',
  standalone: true,
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
          <bk-cat name="channelType" [value]="channelType()" [categories]="addressChannels" [showHelper]="true" [readOnly]="readOnly()" (changed)="onChange('channelType', $event)" />
        </ion-col>

        @if(channelType() === addressChannel.Custom) {
          <ion-col size="12" size-md="6">
            <bk-text-input name="channelLabel" [value]="channelLabel()" [showHelper]="true" [readOnly]="readOnly()" />
            <bk-error-note [errors]="channelLabelError()" />                                                                                                                     
          </ion-col>
        }
      </ion-row>

      <ion-row>
        <ion-col size="12" size-md="6">
          <bk-cat name="usageType" [value]="usageType()" [categories]="addressUsages" [showHelper]="true" [readOnly]="readOnly()" (changed)="onChange('usageType', $event)" />
        </ion-col>

        @if(usageType() === addressUsage.Custom) {
          <ion-col size="12" size-md="6">
            <bk-text-input name="usageLabel" [value]="usageLabel()"  [showHelper]="true" [readOnly]="readOnly()" (changed)="onChange('usageLabel', $event)" />
            <bk-error-note [errors]="usageLabelError()" />                                                                                                                     
          </ion-col>
        }
      </ion-row>

      @switch (channelType()) {
        @case (addressChannel.Email) {
          <ion-row>
            <ion-col size="12">
              <bk-email [value]="email()" [readOnly]="readOnly()" (changed)="onChange('email', $event)" />
              <bk-error-note [errors]="emailError()" />                                                                                                                     
            </ion-col>
          </ion-row>
        }
        @case (addressChannel.Phone) {
          <ion-row>
            <ion-col size="12"> 
              <bk-phone [value]="phone()" [readOnly]="readOnly()" (changed)="onChange('phone', $event)" />
              <bk-error-note [errors]="phoneError()" />                                                                                                                     
            </ion-col>
          </ion-row>
        }
        @case (addressChannel.Postal) {
          <ion-row>
            <ion-col size="9">
              <bk-text-input name="streetName" [value]="streetName()" [readOnly]="readOnly()" autocomplete="street-address" (changed)="onChange('streetName', $event)" />
              <bk-error-note [errors]="streetNameError()" />                                                                                                                     
            </ion-col>
            <ion-col size="3">
              <bk-text-input name="streetNumber" [value]="streetNumber()" [readOnly]="readOnly()" (changed)="onChange('streetNumber', $event)" />
              <bk-error-note [errors]="streetNumberError()" />                                                                                                                     
            </ion-col>

            <ion-col size="12">
              <bk-text-input name="addressValue2" [value]="addressValue2()" [readOnly]="readOnly()" (changed)="onChange('addressValue2', $event)" />
            </ion-col>
          </ion-row>
          
          <bk-swisscity-search (citySelected)="onCitySelected($event)" />

          <ion-row>
            <ion-col size="12" size-md="3">
             <bk-text-input name="countryCode" [value]="countryCode()" [readOnly]="readOnly()" (changed)="onChange('countryCode', $event)" />
            </ion-col>
    
            <ion-col size="12" size-md="3">
              <bk-text-input name="zipCode" [value]="zipCode()" [readOnly]="readOnly()" (changed)="onChange('zipCode', $event)" />
            </ion-col>
            
            <ion-col size="12" size-md="6">
              <bk-text-input name="city" [value]="city()" [readOnly]="readOnly()" (changed)="onChange('city', $event)" />
            </ion-col>
          </ion-row>
        }
        @case (addressChannel.BankAccount) {
          <ion-row>
            <ion-col size="12">
              <bk-iban [value]="iban()" [readOnly]="readOnly()" (changed)="onChange('iban', $event)" />
              <bk-error-note [errors]="ibanError()" />                                                                                                                     
            </ion-col>
          </ion-row>
          @if(hasRole('admin')) {
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="url" [value]="url()" [readOnly]="readOnly()" (changed)="onChange('url', $event)" />
                <bk-error-note [errors]="urlError()" />                                                                                                                     
              </ion-col>
            </ion-row>
          }
        }
        @default {
          <ion-row>
            <ion-col size="12">
              <bk-text-input name="url" [value]="url()" [readOnly]="readOnly()" (changed)="onChange('url', $event)" />
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
            <bk-checkbox name="isFavorite" [isChecked]="isFavorite()" [readOnly]="readOnly()" (changed)="onChange('isFavorite', $event)" />
          </ion-col>  
        }

        @if(isFavorite() === false && channelType() === addressChannel.Email) {
          <ion-col size="12" size-md="6">
            <bk-checkbox name="isCc" [isChecked]="isCc()" [readOnly]="readOnly()" (changed)="onChange('isCc', $event)" />
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
  protected readOnly = input(true);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = addressFormValidations;
  protected shape = addressFormModelShape;
  private readonly validationResult = computed(() => addressFormValidations(this.vm()));
  protected channelLabelError = computed(() => this.validationResult().getErrors('channelLabel'));
  protected usageLabelError = computed(() => this.validationResult().getErrors('usageLabel'));
  protected emailError = computed(() => this.validationResult().getErrors('email'));
  protected phoneError = computed(() => this.validationResult().getErrors('phone'));
  protected streetNameError = computed(() => this.validationResult().getErrors('streetName'));
  protected streetNumberError = computed(() => this.validationResult().getErrors('streetNumber'));
  protected ibanError = computed(() => this.validationResult().getErrors('iban'));
  protected urlError = computed(() => this.validationResult().getErrors('url'));
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
  protected email = computed(() => this.vm().email ?? '');
  protected phone = computed(() => this.vm().phone ?? '');
  protected streetName = computed(() => this.vm().streetName ?? '');
  protected streetNumber = computed(() => this.vm().streetNumber ?? '');
  protected addressValue2 = computed(() => this.vm().addressValue2 ?? '');
  protected countryCode = computed(() => this.vm().countryCode ?? 'CH');
  protected zipCode = computed(() => this.vm().zipCode ?? '');
  protected city = computed(() => this.vm().city ?? '');
  protected url = computed(() => this.vm().url ?? '');
  protected iban = computed(() => this.vm().iban ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected isFavorite = computed(() => this.vm().isFavorite ?? false);
  protected isCc = computed(() => this.vm().isCc ?? false);
  protected isFavorable = computed(() => this.vm().isCc === false);

  public addressChannel = AddressChannel;
  public addressUsage = AddressUsage;
  public addressChannels = AddressChannels;
  public addressUsages = AddressUsages;

  protected onValueChange(value: AddressFormModel): void {
    this.vm.update((vm) => ({...vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, value: string | string[] | number | boolean): void {
    if (!value) return;
    this.vm.update((vm) => ({ ...vm, [fieldName]: value }));
    debugFormErrors('AddressForm', this.validationResult().errors, this.currentUser());
    //this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onCitySelected(city: SwissCity): void {
    this.vm.update((vm) => ({ ...vm, city: city.name, countryCode: city.countryCode, zipCode: String(city.zipCode) }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}