import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChVatMask } from '@bk2/shared-config';
import { CategoryListModel, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, EmailInputComponent, ErrorNoteComponent, NotesInputComponent, PhoneInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { SwissCitySearchComponent } from '@bk2/subject-swisscities-ui';

import { OrgFormModel, OrgNewFormModel, orgNewFormModelShape, orgNewFormValidations } from '@bk2/subject-org-util';
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
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <!---------------------------------------------------
          ORGANISATION 
          --------------------------------------------------->
          @if (isOrgTypeVisible()) {
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="types()" [selectedItemName]="type()" [withAll]="false" [readOnly]="isOrgTypeReadOnly() || readOnly()" (changed)="onChange('type', $event)" />
              </ion-col>
            </ion-row>
          }

          <ion-row> 
            <ion-col size="12">
              <bk-text-input name="orgName" [value]="name()" autocomplete="organization" [maxLength]=50 [readOnly]="readOnly()" (changed)="onChange('name', $event)" />
              <bk-error-note [errors]="orgNameErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>

          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfFoundation" [storeDate]="dateOfFoundation()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('dateOfFoundation', $event)" />
            </ion-col>
    
            <ion-col size="12" size-md="6">
              <bk-date-input name="dateOfLiquidation" [storeDate]="dateOfLiquidation()" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('dateOfLiquidation', $event)" />
            </ion-col>
          </ion-row>

          <!---------------------------------------------------
          ADDRESSES  
          --------------------------------------------------->
          <ion-row>
            <ion-col size="10">
              <bk-text-input name="streetName" [value]="streetName()" autocomplete="street-address" [readOnly]="readOnly()" (changed)="onChange('streetName', $event)" />
              <bk-error-note [errors]="streetNameErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="2">
              <bk-text-input name="streetNumber" [value]="streetNumber()" [readOnly]="readOnly()" (changed)="onChange('streetNumber', $event)" />
              <bk-error-note [errors]="streetNumberErrors()" />                                                                                                                     
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
          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-phone [value]="phone()" [readOnly]="readOnly()" (changed)="onChange('phone', $event)" />
              <bk-error-note [errors]="phoneErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12">
              <bk-email [value]="email()" [readOnly]="readOnly()" (changed)="onChange('email', $event)" />
              <bk-error-note [errors]="emailErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12">
              <bk-text-input name="url" [value]="url()" [readOnly]="readOnly()" (changed)="onChange('url', $event)" />
              <bk-error-note [errors]="urlErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input name="taxId" [value]="taxId()" [mask]="vatMask" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('taxId', $event)" />
            </ion-col>
          </ion-row>
          @if(hasRole('admin')) {
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="bexioId" [value]="bexioId()" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('bexioId', $event)" />                                        
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="orgTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />

    @if(hasRole('admin')) { 
      <bk-notes name="notes" [readOnly]="readOnly()" [value]="notes()" />
    }
  </form>
  `
})
export class OrgNewFormComponent {
  public vm = model.required<OrgNewFormModel>();
  public currentUser = input.required<UserModel | undefined>();
  public isOrgTypeReadOnly = input(false);
  public isOrgTypeVisible = input(true);
  public orgTags = input.required<string>();
  public types = input.required<CategoryListModel>();

  public readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));  

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = orgNewFormValidations;
  protected readonly shape = orgNewFormModelShape;

  protected type = computed(() => this.vm().type ?? DEFAULT_ORG_TYPE);
  protected name = computed(() => this.vm().name ?? DEFAULT_NAME);
  protected dateOfFoundation = computed(() => this.vm().dateOfFoundation ?? DEFAULT_DATE);
  protected dateOfLiquidation = computed(() => this.vm().dateOfLiquidation ?? DEFAULT_DATE);

  protected streetName = computed(() => this.vm().streetName ?? DEFAULT_NAME);
  protected streetNumber = computed(() => this.vm().streetNumber ?? '');
  protected zipCode = computed(() => this.vm().zipCode ?? '');
  protected city = computed(() => this.vm().city ?? '');
  protected countryCode = computed(() => this.vm().countryCode ?? '');
  protected phone = computed(() => this.vm().phone ?? DEFAULT_PHONE);
  protected email = computed(() => this.vm().email ?? DEFAULT_EMAIL);
  protected url = computed(() => this.vm().url ?? DEFAULT_URL);

  protected taxId = computed(() => this.vm().taxId ?? DEFAULT_ID);
  protected bexioId = computed(() => this.vm().bexioId ?? DEFAULT_ID);
  protected tags = computed(() => this.vm().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.vm().notes ?? DEFAULT_NOTES);

  private readonly validationResult = computed(() => orgNewFormValidations(this.vm()));
  protected orgNameErrors = computed(() => this.validationResult().getErrors('orgName'));
  protected streetNameErrors = computed(() => this.validationResult().getErrors('streetName'));
  protected streetNumberErrors = computed(() => this.validationResult().getErrors('streetNumber'));
  protected phoneErrors = computed(() => this.validationResult().getErrors('phone'));
  protected emailErrors = computed(() => this.validationResult().getErrors('email'));
  protected urlErrors = computed(() => this.validationResult().getErrors('url'));

  protected bexioMask = BexioIdMask;
  protected vatMask = ChVatMask;

  protected onCitySelected(city: SwissCity): void {
    this.vm.update((vm) => ({ ...vm, city: city.name, countryCode: city.countryCode, zipCode: String(city.zipCode) }));
  }

  protected onValueChange(value: OrgFormModel): void {
    this.vm.update((vm) => ({...vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('OrgNewForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
