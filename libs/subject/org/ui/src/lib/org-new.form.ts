import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChVatMask } from '@bk2/shared-config';
import { CategoryListModel, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, EmailInputComponent, ErrorNoteComponent, NotesInputComponent, PhoneInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';

import { SwissCitySearchComponent } from '@bk2/subject-swisscities-ui';

import { OrgNewFormModel, orgNewFormValidations } from '@bk2/subject-org-util';
import { DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_URL } from '@bk2/shared-constants';

@Component({
  selector: 'bk-org-new-form',
  standalone: true,
  imports: [
    vestForms,
    DateInputComponent, TextInputComponent, ChipsComponent, NotesInputComponent, ErrorNoteComponent,
    EmailInputComponent, PhoneInputComponent, SwissCitySearchComponent, CategorySelectComponent,
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

            <ion-row> 
              <ion-col size="12">
                <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" autocomplete="organization" [maxLength]=50 [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="nameErrors()" />                                                                                                                     
              </ion-col>
            </ion-row>

            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input name="dateOfFoundation" [storeDate]="dateOfFoundation()" (storeDateChange)="onFieldChange('dateOfFoundation', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
      
              <ion-col size="12" size-md="6">
                <bk-date-input name="dateOfLiquidation" [storeDate]="dateOfLiquidation()" (storeDateChange)="onFieldChange('dateOfLiquidation', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            <!---------------------------------------------------
            ADDRESSES  
            --------------------------------------------------->
            <ion-row>
              <ion-col size="10">
                <bk-text-input name="streetName" [value]="streetName()" (valueChange)="onFieldChange('streetName', $event)" autocomplete="street-address" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="streetNameErrors()" />                                                                                                                     
              </ion-col>
              <ion-col size="2">
                <bk-text-input name="streetNumber" [value]="streetNumber()" (valueChange)="onFieldChange('streetNumber', $event)" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="streetNumberErrors()" />                                                                                                                     
              </ion-col>
            </ion-row>

            <bk-swisscity-search (citySelected)="onCitySelected($event)" />

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
            <ion-row>
              <ion-col size="12" size-md="6"> 
                <bk-phone [value]="phone()" (valueChange)="onFieldChange('phone', $event)" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="phoneErrors()" />                                                                                                                     
              </ion-col>
              <ion-col size="12">
                <bk-email [value]="email()" (valueChange)="onFieldChange('email', $event)" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="emailErrors()" />                                                                                                                     
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="url" [value]="url()" (valueChange)="onFieldChange('url', $event)" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="urlErrors()" />                                                                                                                     
              </ion-col>
            </ion-row>


            
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="taxId" [value]="taxId()" (valueChange)="onFieldChange('taxId', $event)" [mask]="vatMask" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            @if(hasRole('admin')) {
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="bexioId" [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" />
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
        <bk-notes name="notes" [readOnly]="isReadOnly()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" />
      }
    </form>
  }
  `
})
export class OrgNewFormComponent {

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

  protected onCitySelected(city: SwissCity): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, city: city.name, countryCode: city.countryCode, zipCode: city.zipCode }));
    debugFormErrors('OrgNewForm.onCitySelected', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
