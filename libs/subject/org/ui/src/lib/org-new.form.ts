import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChVatMask } from '@bk2/shared-config';
import { CategoryListModel, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, EmailInput, EmailInputI18n, ErrorNote, NotesInput, NotesInputI18n, PhoneInput, PhoneInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_URL } from '@bk2/shared-constants';

import { SwissCitySearch } from '@bk2/subject-swisscities-ui';
import { OrgI18n, OrgNewFormModel, orgNewFormValidations } from '@bk2/subject-org-util';
import { ZefixCompanyDetails } from '@bk2/subject-org-data-access';

import { ZefixLookup } from './zefix-lookup';

@Component({
  selector: 'bk-org-new-form',
  standalone: true,
  imports: [
    vestForms,
    DateInput, TextInput, Chips, NotesInput, ErrorNote, EmailInput, PhoneInput, 
    SwissCitySearch, CategorySelect, ZefixLookup,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <!---------------------------------------------------
            ORGANISATION 
            --------------------------------------------------->
            @if (isOrgTypeVisible()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="types()" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [readOnly]="isOrgTypeReadOnly() || isReadOnly()" />
                </ion-col>
              </ion-row>
            }

            <ion-row class="ion-align-items-center">
              <ion-col [size]="isLegalEntity() ? 10 : 12">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" autocomplete="organization" [maxLength]=50 [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="nameErrors()" />
              </ion-col>
              @if (isLegalEntity()) {
                <ion-col size="2" class="ion-text-center">
                  <bk-zefix-lookup [orgName]="name()" (detailsLoaded)="onZefixSelected($event)" />
                </ion-col>
              }
            </ion-row>

            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="dateOfFoundationI18n()" [storeDate]="dateOfFoundation()" (storeDateChange)="onFieldChange('dateOfFoundation', $event)" [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="dateOfLiquidationI18n()" [storeDate]="dateOfLiquidation()" (storeDateChange)="onFieldChange('dateOfLiquidation', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            <!---------------------------------------------------
            ADDRESSES  
            --------------------------------------------------->
            <ion-row>
              <ion-col size="10">
                <bk-text-input [i18n]="streetNameI18n()" [value]="streetName()" (valueChange)="onFieldChange('streetName', $event)" autocomplete="street-address" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="streetNameErrors()" />                                                                                                                     
              </ion-col>
              <ion-col size="2">
                <bk-text-input [i18n]="streetNumberI18n()" [value]="streetNumber()" (valueChange)="onFieldChange('streetNumber', $event)" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="streetNumberErrors()" />                                                                                                                     
              </ion-col>
            </ion-row>

            <bk-swisscity-search (citySelected)="onCitySelected($event)" />

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
            <ion-row>
              <ion-col size="12" size-md="6"> 
                <bk-phone [i18n]="phoneI18n()" [value]="phone()" (valueChange)="onFieldChange('phone', $event)" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="phoneErrors()" />
              </ion-col>
              <ion-col size="12">
                <bk-email [i18n]="emailI18n()" [value]="email()" (valueChange)="onFieldChange('email', $event)" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="emailErrors()" />                                                                                                                     
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="urlErrors()" />                                                                                                                     
              </ion-col>
            </ion-row>


            
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="taxIdI18n()" [value]="taxId()" (valueChange)="onFieldChange('taxId', $event)" [mask]="vatMask" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            @if(hasRole('admin')) {
              <ion-row>
                <ion-col size="12">
                  <bk-text-input [i18n]="bexioIdI18n()" [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) { 
        <bk-notes-input [i18n]="notesI18n()" [readOnly]="isReadOnly()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" />
      }
    </form>
  }
  `
})
export class OrgNewForm {
  public readonly i18n = input.required<OrgI18n>();
  protected nameI18n        = computed(() => ({ name: 'name',        label: this.i18n().name_label(),        placeholder: this.i18n().name_placeholder(),        helper: this.i18n().name_helper()        } as TextInputI18n));
  protected streetNameI18n  = computed(() => ({ name: 'streetName',  label: this.i18n().streetName_label(),  placeholder: this.i18n().streetName_placeholder(),  helper: this.i18n().streetName_helper()  } as TextInputI18n));
  protected streetNumberI18n = computed(() => ({ name: 'streetNumber', label: this.i18n().streetNumber_label(), placeholder: this.i18n().streetNumber_placeholder(), helper: this.i18n().streetNumber_helper() } as TextInputI18n));
  protected countryCodeI18n = computed(() => ({ name: 'countryCode', label: this.i18n().countryCode_label(), placeholder: this.i18n().countryCode_placeholder(), helper: this.i18n().countryCode_helper() } as TextInputI18n));
  protected zipCodeI18n     = computed(() => ({ name: 'zipCode',     label: this.i18n().zipCode_label(),     placeholder: this.i18n().zipCode_placeholder(),     helper: this.i18n().zipCode_helper()     } as TextInputI18n));
  protected cityI18n        = computed(() => ({ name: 'city',        label: this.i18n().city_label(),        placeholder: this.i18n().city_placeholder(),        helper: this.i18n().city_helper()        } as TextInputI18n));
  protected urlI18n         = computed(() => ({ name: 'url',         label: this.i18n().url_label(),         placeholder: this.i18n().url_placeholder(),         helper: this.i18n().url_helper()         } as TextInputI18n));
  protected taxIdI18n       = computed(() => ({ name: 'taxId',       label: this.i18n().taxId_label(),       placeholder: this.i18n().taxId_placeholder(),       helper: this.i18n().taxId_helper()       } as TextInputI18n));
  protected bexioIdI18n     = computed(() => ({ name: 'bexioId',     label: this.i18n().bexioId_label(),     placeholder: this.i18n().bexioId_placeholder(),     helper: this.i18n().bexioId_helper()     } as TextInputI18n));
  protected notesI18n       = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected emailI18n       = computed(() => ({ name: 'email', label: this.i18n().email_label(), placeholder: this.i18n().email_placeholder() } as EmailInputI18n));
  protected phoneI18n       = computed(() => ({ name: 'phone', label: this.i18n().phone_label(), placeholder: this.i18n().phone_placeholder() } as PhoneInputI18n));
  protected dateOfFoundationI18n  = computed(() => ({ name: 'dateOfFoundation',  label: this.i18n().dateOfFoundation_label(),  placeholder: this.i18n().dateOfFoundation_placeholder(),  helper: this.i18n().dateOfFoundation_helper()  } as DateInputI18n));
  protected dateOfLiquidationI18n = computed(() => ({ name: 'dateOfLiquidation', label: this.i18n().dateOfLiquidation_label(), placeholder: this.i18n().dateOfLiquidation_placeholder(), helper: this.i18n().dateOfLiquidation_helper() } as DateInputI18n));

  // inputs
  public formData = model.required<OrgNewFormModel>();
  public currentUser = input.required<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public isOrgTypeReadOnly = input(false);
  public isOrgTypeVisible = input(true);
  public readonly allTags = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isLegalEntity = computed(() => this.type() === 'legalEntity');

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  
  // validation and errors
  protected readonly suite = orgNewFormValidations;
  private readonly validationResult = computed(() => orgNewFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected streetNameErrors = computed(() => this.validationResult().getErrors('streetName'));
  protected streetNumberErrors = computed(() => this.validationResult().getErrors('streetNumber'));
  protected phoneErrors = computed(() => this.validationResult().getErrors('phone'));
  protected emailErrors = computed(() => this.validationResult().getErrors('email'));
  protected urlErrors = computed(() => this.validationResult().getErrors('url'));

  // fields
  protected type = linkedSignal(() => this.formData().type ?? DEFAULT_ORG_TYPE);
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected dateOfFoundation = linkedSignal(() => this.formData().dateOfFoundation ?? DEFAULT_DATE);
  protected dateOfLiquidation = linkedSignal(() => this.formData().dateOfLiquidation ?? DEFAULT_DATE);
  protected streetName = linkedSignal(() => this.formData().streetName ?? DEFAULT_NAME);
  protected streetNumber = linkedSignal(() => this.formData().streetNumber ?? '');
  protected zipCode = linkedSignal(() => this.formData().zipCode ?? '');
  protected city = linkedSignal(() => this.formData().city ?? '');
  protected countryCode = linkedSignal(() => this.formData().countryCode ?? '');
  protected phone = linkedSignal(() => this.formData().phone ?? DEFAULT_PHONE);
  protected email = linkedSignal(() => this.formData().email ?? DEFAULT_EMAIL);
  protected url = linkedSignal(() => this.formData().url ?? DEFAULT_URL);
  protected taxId = linkedSignal(() => this.formData().taxId ?? DEFAULT_ID);
  protected bexioId = linkedSignal(() => this.formData().bexioId ?? DEFAULT_ID);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected vatMask = ChVatMask;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: OrgNewFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('OrgNewForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('OrgNewForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onZefixSelected(details: ZefixCompanyDetails): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm,
      name: details.name || vm.name,
      taxId: details.taxId || vm.taxId,
      streetName: details.streetName || vm.streetName,
      streetNumber: details.streetNumber || vm.streetNumber,
      countryCode: details.countryCode || vm.countryCode,
      zipCode: details.zipCode || vm.zipCode,
      city: details.city || vm.city,
      notes: details.notes || vm.notes,
    }));
  }

  protected onCitySelected(city: SwissCity): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, city: city.name, countryCode: city.countryCode, zipCode: city.zipCode }));
    debugFormErrors('OrgNewForm.onCitySelected', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
