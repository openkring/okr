import { Component, computed, effect, inject, input, linkedSignal, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChSsnMask } from '@bk2/shared-config';
import { CategoryListModel, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, EmailInput, EmailInputI18n, ErrorNote, NotesInput, NotesInputI18n, PhoneInput, PhoneInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getTodayStr, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_LOCALE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_URL } from '@bk2/shared-constants';
import { AhvFormat, formatAhv } from '@bk2/shared-util-angular';
import { I18nService } from '@bk2/shared-i18n';

import { AvatarPipe } from '@bk2/avatar-ui';
import { SwissCitySearch } from '@bk2/subject-swisscities-ui';
import { MemberNewFormModel, memberNewFormValidations } from '@bk2/relationship-membership-util';
import { PFX } from './scope';

export interface MemberNewFormI18n {
  personDetails: string;
  personAddress: string;
  personMisc: string;
  personMembership: string;
  selectLabel: string;
}

@Component({
  selector: 'bk-member-new-form',
  standalone: true,
  imports: [
    vestForms,
    FormsModule,
    AvatarPipe,
    TextInput, DateInput, CategorySelect, Chips, NotesInput,
    ErrorNote, PhoneInput, EmailInput,
    SwissCitySearch,
    IonGrid, IonRow, IonCol, IonItem, IonAvatar, IonImg, IonButton, IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  styles: [`ion-thumbnail { width: 30px; height: 30px; }`],
  template: `
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

      <!-------------------------------------- PERSON ------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().personDetails }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row> 
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="firstNameI18n()" [value]="firstName()" (valueChange)="onFieldChange('firstName', $event)" autocomplete="given-name" [readOnly]="isReadOnly()" [autofocus]="true" [maxLength]=30 />
                <bk-error-note [errors]="firstNameErrors()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="lastNameI18n()" [value]="lastName()" (valueChange)="onFieldChange('lastName', $event)" autocomplete="family-name" [readOnly]="isReadOnly()" [maxLength]=30 />
                <bk-error-note [errors]="lastNameErrors()" />
              </ion-col>
            </ion-row>

            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="genders()!" [selectedItemName]="gender()" (selectedItemNameChange)="onFieldChange('gender', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="dateOfBirthI18n()" [storeDate]="dateOfBirth()" (storeDateChange)="onFieldChange('dateOfBirth', $event)" [locale]="locale()" [readOnly]="isReadOnly()" autocomplete="bday" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="dateOfDeathI18n()" [storeDate]="dateOfDeath()" (storeDateChange)="onFieldChange('dateOfDeath', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-------------------------------------- ADDRESSES ------------------------------------->
      @if(showAddressInputs()) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().personAddress }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="9">
                  <bk-text-input [i18n]="streetNameI18n()" [value]="streetName()" (valueChange)="onFieldChange('streetName', $event)" autocomplete="street-address" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="streetNameErrors()" />
                </ion-col>
                <ion-col size="3">
                  <bk-text-input [i18n]="streetNumberI18n()" [value]="streetNumber()" (valueChange)="onFieldChange('streetNumber', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="streetNumberErrors()" />
                </ion-col>
              </ion-row>

              <bk-swisscity-search (citySelected)="onCitySelected($event)" [setFocus]="false" />

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
                <ion-col size="12" size-md="6">
                  <bk-email [i18n]="emailI18n()" [value]="email()" (valueChange)="onFieldChange('email', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="emailErrors()" />                                                                                                                     
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="webI18n()" [value]="web()" (valueChange)="onFieldChange('web', $event)" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="webErrors()" />                                                                                                                     
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      } <!-- end of address inputs -->

      <!-------------------------------------- OTHER ------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().personMisc }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="ssnIdI18n()" [value]="ssnId()" (valueChange)="onFieldChange('ssnId', $event)" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [readOnly]="isReadOnly()" [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="bexioIdI18n()" [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" />                                        
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-------------------------------------- MEMBERSHIP ------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().personMembership }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
              <ion-row>
                <ion-col size="9">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ 'org.' + orgKey() | avatar }}" alt="Avatar Logo of Organization" />
                    </ion-avatar>
                    <ion-label>{{ orgName() }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3">
                  <ion-item lines="none">
                  <ion-button slot="start" fill="clear" (click)="selectClicked.emit()">{{ i18n().selectLabel }}</ion-button>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-cat-select [category]="membershipCategories()" [selectedItemName]="currentMembershipCategoryItem()" (selectedItemNameChange)="onFieldChange('category', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <bk-date-input [i18n]="dateOfEntryI18n()" [storeDate]="dateOfEntry()" (storeDateChange)="onFieldChange('dateOfEntry', $event)" [readOnly]="isReadOnly()" />
                </ion-col>      
              </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    
      <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      @if(hasRole('admin')) {
        <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  `
})
export class MemberNewForm {
  // inputs
  public readonly i18n = input<MemberNewFormI18n>({ personDetails: '', personAddress: '', personMisc: '', personMembership: '', selectLabel: '' });
  public readonly formData = model.required<MemberNewFormModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly showAddressInputs = input(true);
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly genders = input.required<CategoryListModel>();
  public readonly locale = input<string>(DEFAULT_LOCALE);
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public membershipCategories = input.required<CategoryListModel>();
  
  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public selectClicked = output<void>();

 // validation and errors
  protected readonly suite = memberNewFormValidations;
  private readonly validationResult = computed(() => memberNewFormValidations(this.formData()));
  protected firstNameErrors = computed(() => this.validationResult().getErrors('firstName'));
  protected lastNameErrors = computed(() => this.validationResult().getErrors('lastName'));
  protected streetNameErrors = computed(() => this.validationResult().getErrors('streetName'));
  protected streetNumberErrors = computed(() => this.validationResult().getErrors('streetNumber'));
  protected phoneErrors = computed(() => this.validationResult().getErrors('phone'));
  protected emailErrors = computed(() => this.validationResult().getErrors('email'));
  protected webErrors = computed(() => this.validationResult().getErrors('web'));

  // fields
  protected firstName = linkedSignal(() => this.formData().firstName ?? DEFAULT_NAME);
  protected lastName = linkedSignal(() => this.formData().lastName ?? DEFAULT_NAME);
  protected dateOfBirth = linkedSignal(() => this.formData().dateOfBirth ?? DEFAULT_DATE);
  protected dateOfDeath = linkedSignal(() => this.formData().dateOfDeath ?? DEFAULT_DATE);
  protected gender = linkedSignal(() => this.formData().gender ?? DEFAULT_GENDER);
  protected ssnId = linkedSignal(() => formatAhv(this.formData().ssnId ?? '', AhvFormat.Friendly));
  protected bexioId = linkedSignal(() => this.formData().bexioId ?? DEFAULT_ID);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);

  // address
  protected streetName = linkedSignal(() => this.formData().streetName ?? DEFAULT_NAME);
  protected streetNumber = linkedSignal(() => this.formData().streetNumber ?? '');
  protected zipCode = linkedSignal(() => this.formData().zipCode ?? '');
  protected city = linkedSignal(() => this.formData().city ?? '');
  protected countryCode = linkedSignal(() => this.formData().countryCode ?? '');
  protected phone = linkedSignal(() => this.formData().phone ?? DEFAULT_PHONE);
  protected email = linkedSignal(() => this.formData().email ?? DEFAULT_EMAIL);
  protected web = linkedSignal(() => this.formData().web ?? DEFAULT_URL);

  // membership
  protected orgKey = linkedSignal(() => this.formData().orgKey ?? DEFAULT_KEY);
  protected orgName = linkedSignal(() => this.formData().orgName ?? DEFAULT_NAME);
  protected currentMembershipCategoryItem = linkedSignal(() => this.formData().category ?? '');
  protected dateOfEntry = linkedSignal(() => this.formData().dateOfEntry ?? getTodayStr());

  // i18n
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    firstName_label: PFX + 'firstName.label',
    firstName_placeholder: PFX + 'firstName.placeholder',
    firstName_helper: PFX + 'firstName.helper',
    lastName_label: PFX + 'lastName.label',
    lastName_placeholder: PFX + 'lastName.placeholder',
    lastName_helper: PFX + 'lastName.helper',
    streetName_label: PFX + 'streetName.label',
    streetName_placeholder: PFX + 'streetName.placeholder',
    streetName_helper: PFX + 'streetName.helper',
    streetNumber_label: PFX + 'streetNumber.label',
    streetNumber_placeholder: PFX + 'streetNumber.placeholder',
    streetNumber_helper: PFX + 'streetNumber.helper',
    countryCode_label: PFX + 'countryCode.label',
    countryCode_placeholder: PFX + 'countryCode.placeholder',
    countryCode_helper: PFX + 'countryCode.helper',
    zipCode_label: PFX + 'zipCode.label',
    zipCode_placeholder: PFX + 'zipCode.placeholder',
    zipCode_helper: PFX + 'zipCode.helper',
    city_label: PFX + 'city.label',
    city_placeholder: PFX + 'city.placeholder',
    city_helper: PFX + 'city.helper',
    web_label: PFX + 'web.label',
    web_placeholder: PFX + 'web.placeholder',
    web_helper: PFX + 'web.helper',
    ssnId_label: PFX + 'ssnId.label',
    ssnId_placeholder: PFX + 'ssnId.placeholder',
    ssnId_helper: PFX + 'ssnId.helper',
    bexioId_label: PFX + 'bexioId.label',
    bexioId_placeholder: PFX + 'bexioId.placeholder',
    bexioId_helper: PFX + 'bexioId.helper',
    notes_label:      PFX + 'notes.label',
    notes_placeholder:PFX + 'notes.placeholder',
    email_label:      PFX + 'email.label',
    email_placeholder:PFX + 'email.placeholder',
    phone_label:      PFX + 'phone.label',
    phone_placeholder:PFX + 'phone.placeholder',
    dateOfBirth_label:        PFX + 'dateOfBirth.label',
    dateOfBirth_placeholder:  PFX + 'dateOfBirth.placeholder',
    dateOfBirth_helper:       PFX + 'dateOfBirth.helper',
    dateOfDeath_label:        PFX + 'dateOfDeath.label',
    dateOfDeath_placeholder:  PFX + 'dateOfDeath.placeholder',
    dateOfDeath_helper:       PFX + 'dateOfDeath.helper',
    dateOfEntry_label:        PFX + 'dateOfEntry.label',
    dateOfEntry_placeholder:  PFX + 'dateOfEntry.placeholder',
    dateOfEntry_helper:       PFX + 'dateOfEntry.helper',
  });
  protected firstNameI18n = computed(() => ({ name: 'firstName', label: this.fieldI18n.firstName_label(), placeholder: this.fieldI18n.firstName_placeholder(), helper: this.fieldI18n.firstName_helper() }) as TextInputI18n);
  protected lastNameI18n = computed(() => ({ name: 'lastName', label: this.fieldI18n.lastName_label(), placeholder: this.fieldI18n.lastName_placeholder(), helper: this.fieldI18n.lastName_helper() }) as TextInputI18n);
  protected streetNameI18n = computed(() => ({ name: 'streetName', label: this.fieldI18n.streetName_label(), placeholder: this.fieldI18n.streetName_placeholder(), helper: this.fieldI18n.streetName_helper() }) as TextInputI18n);
  protected streetNumberI18n = computed(() => ({ name: 'streetNumber', label: this.fieldI18n.streetNumber_label(), placeholder: this.fieldI18n.streetNumber_placeholder(), helper: this.fieldI18n.streetNumber_helper() }) as TextInputI18n);
  protected countryCodeI18n = computed(() => ({ name: 'countryCode', label: this.fieldI18n.countryCode_label(), placeholder: this.fieldI18n.countryCode_placeholder(), helper: this.fieldI18n.countryCode_helper() }) as TextInputI18n);
  protected zipCodeI18n = computed(() => ({ name: 'zipCode', label: this.fieldI18n.zipCode_label(), placeholder: this.fieldI18n.zipCode_placeholder(), helper: this.fieldI18n.zipCode_helper() }) as TextInputI18n);
  protected cityI18n = computed(() => ({ name: 'city', label: this.fieldI18n.city_label(), placeholder: this.fieldI18n.city_placeholder(), helper: this.fieldI18n.city_helper() }) as TextInputI18n);
  protected webI18n = computed(() => ({ name: 'web', label: this.fieldI18n.web_label(), placeholder: this.fieldI18n.web_placeholder(), helper: this.fieldI18n.web_helper() }) as TextInputI18n);
  protected ssnIdI18n = computed(() => ({ name: 'ssnId', label: this.fieldI18n.ssnId_label(), placeholder: this.fieldI18n.ssnId_placeholder(), helper: this.fieldI18n.ssnId_helper() }) as TextInputI18n);
  protected bexioIdI18n = computed(() => ({ name: 'bexioId', label: this.fieldI18n.bexioId_label(), placeholder: this.fieldI18n.bexioId_placeholder(), helper: this.fieldI18n.bexioId_helper() }) as TextInputI18n);
  protected notesI18n = computed(() => ({ name: 'notes', label: this.fieldI18n.notes_label(), placeholder: this.fieldI18n.notes_placeholder() } as NotesInputI18n));
  protected emailI18n = computed(() => ({ name: 'email', label: this.fieldI18n.email_label(), placeholder: this.fieldI18n.email_placeholder() } as EmailInputI18n));
  protected phoneI18n = computed(() => ({ name: 'phone', label: this.fieldI18n.phone_label(), placeholder: this.fieldI18n.phone_placeholder() } as PhoneInputI18n));
  protected dateOfBirthI18n = computed(() => ({ name: 'dateOfBirth', label: this.fieldI18n.dateOfBirth_label(), placeholder: this.fieldI18n.dateOfBirth_placeholder(), helper: this.fieldI18n.dateOfBirth_helper() } as DateInputI18n));
  protected dateOfDeathI18n = computed(() => ({ name: 'dateOfDeath', label: this.fieldI18n.dateOfDeath_label(), placeholder: this.fieldI18n.dateOfDeath_placeholder(), helper: this.fieldI18n.dateOfDeath_helper() } as DateInputI18n));
  protected dateOfEntryI18n = computed(() => ({ name: 'dateOfEntry', label: this.fieldI18n.dateOfEntry_label(), placeholder: this.fieldI18n.dateOfEntry_placeholder(), helper: this.fieldI18n.dateOfEntry_helper() } as DateInputI18n));

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected ssnMask = ChSsnMask;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onCitySelected(city: SwissCity): void {
    this.formData.update((vm) => ({ ...vm, city: city.name, countryCode: city.countryCode, zipCode: city.zipCode }));
  }

  protected onFormChange(value: MemberNewFormModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormErrors('MemberNewForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('MemberNewForm.onFieldChange', this.validationResult().errors, this.currentUser());
    debugFormModel<MemberNewFormModel>('MemberNewForm', this.formData(), this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
