import { Component, computed, effect, input, linkedSignal, model, output, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChSsnMask } from '@bk2/shared-config';
import { CategoryListModel, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, EmailInput, EmailInputI18n, ErrorNote, NotesInput, NotesInputI18n, PhoneInput, PhoneInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getTodayStr, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_LOCALE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_URL } from '@bk2/shared-constants';
import { AhvFormat, formatAhv } from '@bk2/shared-util-angular';

import { AvatarPipe } from '@bk2/avatar-ui';
import { SwissCitySearch } from '@bk2/subject-swisscities-ui';
import { MemberNewFormModel, memberNewFormValidations } from '@bk2/relationship-membership-util';

export interface MemberNewFormI18n {
  select: Signal<string>;

  person_details: Signal<string>;
  person_address: Signal<string>;
  person_misc: Signal<string>;
  person_membership: Signal<string>;

  firstname_label: Signal<string>;
  firstname_placeholder: Signal<string>;
  firstname_helper: Signal<string>;

  lastname_label: Signal<string>;
  lastname_placeholder: Signal<string>;
  lastname_helper: Signal<string>;

  streetname_label: Signal<string>;
  streetname_placeholder: Signal<string>;
  streetname_helper: Signal<string>;

  streetnumber_label: Signal<string>;
  streetnumber_placeholder: Signal<string>;
  streetnumber_helper: Signal<string>;

  countrycode_label: Signal<string>;
  countrycode_placeholder: Signal<string>;
  countrycode_helper: Signal<string>;

  zipcode_label: Signal<string>;
  zipcode_placeholder: Signal<string>;
  zipcode_helper: Signal<string>;

  city_label: Signal<string>;
  city_placeholder: Signal<string>;
  city_helper: Signal<string>;

  web_label: Signal<string>;
  web_placeholder: Signal<string>;
  web_helper: Signal<string>;

  ssnid_label: Signal<string>;
  ssnid_placeholder: Signal<string>;
  ssnid_helper: Signal<string>;

  bexioid_label: Signal<string>;
  bexioid_placeholder: Signal<string>;
  bexioid_helper: Signal<string>;

  notes_label: Signal<string>;
  notes_placeholder: Signal<string>;

  email_label: Signal<string>;
  email_placeholder: Signal<string>;

  phone_label: Signal<string>;
  phone_placeholder: Signal<string>;

  dateOfBirth_label: Signal<string>;
  dateOfBirth_placeholder: Signal<string>;
  dateOfBirth_helper: Signal<string>;

  dateOfDeath_label: Signal<string>;
  dateOfDeath_placeholder: Signal<string>;
  dateOfDeath_helper: Signal<string>;

  dateOfEntry_label: Signal<string>;
  dateOfEntry_placeholder: Signal<string>;
  dateOfEntry_helper: Signal<string>;
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
          <ion-card-title>{{ i18n().person_details() }}</ion-card-title>
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
            <ion-card-title>{{ i18n().person_address() }}</ion-card-title>
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
          <ion-card-title>{{ i18n().person_misc() }}</ion-card-title>
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
          <ion-card-title>{{ i18n().person_membership() }}</ion-card-title>
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
                  <ion-button slot="start" fill="clear" (click)="selectClicked.emit()">{{ i18n().select() }}</ion-button>
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
  public readonly i18n = input.required<MemberNewFormI18n>();
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

  // i18n — all field translations come from the i18n input
  protected firstNameI18n = computed(() => ({ name: 'firstName', label: this.i18n().firstname_label(), placeholder: this.i18n().firstname_placeholder(), helper: this.i18n().firstname_helper() }) as TextInputI18n);
  protected lastNameI18n = computed(() => ({ name: 'lastName', label: this.i18n().lastname_label(), placeholder: this.i18n().lastname_placeholder(), helper: this.i18n().lastname_helper() }) as TextInputI18n);
  protected streetNameI18n = computed(() => ({ name: 'streetName', label: this.i18n().streetname_label(), placeholder: this.i18n().streetname_placeholder(), helper: this.i18n().streetname_helper() }) as TextInputI18n);
  protected streetNumberI18n = computed(() => ({ name: 'streetNumber', label: this.i18n().streetnumber_label(), placeholder: this.i18n().streetnumber_placeholder(), helper: this.i18n().streetnumber_helper() }) as TextInputI18n);
  protected countryCodeI18n = computed(() => ({ name: 'countryCode', label: this.i18n().countrycode_label(), placeholder: this.i18n().countrycode_placeholder(), helper: this.i18n().countrycode_helper() }) as TextInputI18n);
  protected zipCodeI18n = computed(() => ({ name: 'zipCode', label: this.i18n().zipcode_label(), placeholder: this.i18n().zipcode_placeholder(), helper: this.i18n().zipcode_helper() }) as TextInputI18n);
  protected cityI18n = computed(() => ({ name: 'city', label: this.i18n().city_label(), placeholder: this.i18n().city_placeholder(), helper: this.i18n().city_helper() }) as TextInputI18n);
  protected webI18n = computed(() => ({ name: 'web', label: this.i18n().web_label(), placeholder: this.i18n().web_placeholder(), helper: this.i18n().web_helper() }) as TextInputI18n);
  protected ssnIdI18n = computed(() => ({ name: 'ssnId', label: this.i18n().ssnid_label(), placeholder: this.i18n().ssnid_placeholder(), helper: this.i18n().ssnid_helper() }) as TextInputI18n);
  protected bexioIdI18n = computed(() => ({ name: 'bexioId', label: this.i18n().bexioid_label(), placeholder: this.i18n().bexioid_placeholder(), helper: this.i18n().bexioid_helper() }) as TextInputI18n);
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected emailI18n = computed(() => ({ name: 'email', label: this.i18n().email_label(), placeholder: this.i18n().email_placeholder() } as EmailInputI18n));
  protected phoneI18n = computed(() => ({ name: 'phone', label: this.i18n().phone_label(), placeholder: this.i18n().phone_placeholder() } as PhoneInputI18n));
  protected dateOfBirthI18n = computed(() => ({ name: 'dateOfBirth', label: this.i18n().dateOfBirth_label(), placeholder: this.i18n().dateOfBirth_placeholder(), helper: this.i18n().dateOfBirth_helper() } as DateInputI18n));
  protected dateOfDeathI18n = computed(() => ({ name: 'dateOfDeath', label: this.i18n().dateOfDeath_label(), placeholder: this.i18n().dateOfDeath_placeholder(), helper: this.i18n().dateOfDeath_helper() } as DateInputI18n));
  protected dateOfEntryI18n = computed(() => ({ name: 'dateOfEntry', label: this.i18n().dateOfEntry_label(), placeholder: this.i18n().dateOfEntry_placeholder(), helper: this.i18n().dateOfEntry_helper() } as DateInputI18n));

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
