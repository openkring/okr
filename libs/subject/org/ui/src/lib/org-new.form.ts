import { Component, computed, input, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChVatMask } from '@bk2/shared-config';
import { CategoryListModel, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, EmailInputComponent, ErrorNoteComponent, NotesInputComponent, PhoneInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { SwissCitySearchComponent } from '@bk2/subject-swisscities-ui';

import { ORG_NEW_FORM_SHAPE, OrgFormModel, OrgNewFormModel, orgNewFormValidations } from '@bk2/subject-org-util';
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
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <!---------------------------------------------------
          ORGANISATION 
          --------------------------------------------------->
          @if (isOrgTypeVisible()) {
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="types()" [selectedItemName]="type()" [withAll]="false" [readOnly]="isOrgTypeReadOnly() || isReadOnly()" (changed)="onFieldChange('type', $event)" />
              </ion-col>
            </ion-row>
          }

          <ion-row> 
            <ion-col size="12">
              <bk-text-input name="name" [value]="name()" autocomplete="organization" [maxLength]=50 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
              <bk-error-note [errors]="nameErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>

          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfFoundation" [storeDate]="dateOfFoundation()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfFoundation', $event)" />
            </ion-col>
    
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfLiquidation" [storeDate]="dateOfLiquidation()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfLiquidation', $event)" />
            </ion-col>
          </ion-row>

          <!---------------------------------------------------
          ADDRESSES  
          --------------------------------------------------->
          <ion-row>
            <ion-col size="10">
              <bk-text-input name="streetName" [value]="streetName()" autocomplete="street-address" [readOnly]="isReadOnly()" (changed)="onFieldChange('streetName', $event)" />
              <bk-error-note [errors]="streetNameErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="2">
              <bk-text-input name="streetNumber" [value]="streetNumber()" [readOnly]="isReadOnly()" (changed)="onFieldChange('streetNumber', $event)" />
              <bk-error-note [errors]="streetNumberErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>

          <bk-swisscity-search (citySelected)="onCitySelected($event)" />

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
          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-phone [value]="phone()" [readOnly]="isReadOnly()" (changed)="onFieldChange('phone', $event)" />
              <bk-error-note [errors]="phoneErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12">
              <bk-email [value]="email()" [readOnly]="isReadOnly()" (changed)="onFieldChange('email', $event)" />
              <bk-error-note [errors]="emailErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="url" [value]="url()" [readOnly]="isReadOnly()" (changed)="onFieldChange('url', $event)" />
              <bk-error-note [errors]="urlErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input name="taxId" [value]="taxId()" [mask]="vatMask" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('taxId', $event)" />
            </ion-col>
          </ion-row>
          @if(hasRole('admin')) {
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="bexioId" [value]="bexioId()" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('bexioId', $event)" />                                        
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />

    @if(hasRole('admin')) { 
      <bk-notes name="notes" [readOnly]="isReadOnly()" [value]="notes()" (changed)="onFieldChange('notes', $event)" />
    }
  </form>
  `
})
export class OrgNewFormComponent {

  // inputs
  public formData = model.required<OrgNewFormModel>();
  public currentUser = input.required<UserModel | undefined>();
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
  protected readonly shape = ORG_NEW_FORM_SHAPE;
  private readonly validationResult = computed(() => orgNewFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected streetNameErrors = computed(() => this.validationResult().getErrors('streetName'));
  protected streetNumberErrors = computed(() => this.validationResult().getErrors('streetNumber'));
  protected phoneErrors = computed(() => this.validationResult().getErrors('phone'));
  protected emailErrors = computed(() => this.validationResult().getErrors('email'));
  protected urlErrors = computed(() => this.validationResult().getErrors('url'));

  // fields
  protected type = computed(() => this.formData().type ?? DEFAULT_ORG_TYPE);
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);
  protected dateOfFoundation = computed(() => this.formData().dateOfFoundation ?? DEFAULT_DATE);
  protected dateOfLiquidation = computed(() => this.formData().dateOfLiquidation ?? DEFAULT_DATE);
  protected streetName = computed(() => this.formData().streetName ?? DEFAULT_NAME);
  protected streetNumber = computed(() => this.formData().streetNumber ?? '');
  protected zipCode = computed(() => this.formData().zipCode ?? '');
  protected city = computed(() => this.formData().city ?? '');
  protected countryCode = computed(() => this.formData().countryCode ?? '');
  protected phone = computed(() => this.formData().phone ?? DEFAULT_PHONE);
  protected email = computed(() => this.formData().email ?? DEFAULT_EMAIL);
  protected url = computed(() => this.formData().url ?? DEFAULT_URL);
  protected taxId = computed(() => this.formData().taxId ?? DEFAULT_ID);
  protected bexioId = computed(() => this.formData().bexioId ?? DEFAULT_ID);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected vatMask = ChVatMask;

  protected onFormChange(value: OrgNewFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('OrgNewForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('OrgNewForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected onCitySelected(city: SwissCity): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, city: city.name, countryCode: city.countryCode, zipCode: String(city.zipCode) }));
    debugFormErrors('OrgNewForm.onCitySelected', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
