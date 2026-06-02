import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChSsnMask } from '@bk2/shared-config';
import { CategoryListModel, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategorySelect, Checkbox, CheckboxI18n, Chips, DateInput, DateInputI18n, EmailInput, EmailInputI18n, ErrorNote, NotesInput, NotesInputI18n, PhoneInput, PhoneInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getTodayStr, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_LOCALE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_URL } from '@bk2/shared-constants';
import { AhvFormat, formatAhv } from '@bk2/shared-util-angular';

import { AvatarPipe } from '@bk2/avatar-ui';
import { SwissCitySearch } from '@bk2/subject-swisscities-ui';

import { PersonNewFormModel, personNewFormValidations, PersonI18n } from '@bk2/subject-person-util';

@Component({
  selector: 'bk-person-new-form',
  standalone: true,
  imports: [
    vestForms,
    FormsModule,
    AvatarPipe, TextInput, DateInput, CategorySelect,
    Chips, NotesInput, ErrorNote, PhoneInput, EmailInput, CategorySelect, Checkbox, SwissCitySearch,
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
          <ion-card-title>{{ i18n().details() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row> 
              <ion-col size="12" size-md="6">
                <bk-text-input
                  [i18n]="firstNameI18n()"
                  [value]="firstName()" (valueChange)="onFieldChange('firstName', $event)"
                  autocomplete="given-name"
                  [readOnly]="isReadOnly()"
                  [autofocus]="true"
                  [clearInput]="false"
                  [maxLength]=30
                />
                <bk-error-note [errors]="firstNameErrors()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input
                  [i18n]="lastNameI18n()"
                  [value]="lastName()" (valueChange)="onFieldChange('lastName', $event)"
                  autocomplete="family-name"
                  [readOnly]="isReadOnly()"
                  [clearInput]="false"
                  [maxLength]=30
                />
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
            <ion-card-title>{{ i18n().addresses() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="9">
                  <bk-text-input
                    [i18n]="streetNameI18n()"
                    [value]="streetName()" (valueChange)="onFieldChange('streetName', $event)"
                    autocomplete="street-address"
                    [clearInput]="false"
                    [readOnly]="isReadOnly()"
                  />
                  <bk-error-note [errors]="streetNameErrors()" />
                </ion-col>
                <ion-col size="3">
                  <bk-text-input
                    [i18n]="streetNumberI18n()"
                    [value]="streetNumber()" (valueChange)="onFieldChange('streetNumber', $event)"
                    [clearInput]="false"
                    [readOnly]="isReadOnly()"
                  />
                  <bk-error-note [errors]="streetNumberErrors()" />
                </ion-col>
              </ion-row>

              <bk-swisscity-search (citySelected)="onCitySelected($event)" [setFocus]="false" />

              <ion-row>
                <ion-col size="12" size-md="3">
                  <bk-text-input
                    [i18n]="countryCodeI18n()"
                    [value]="countryCode()" (valueChange)="onFieldChange('countryCode', $event)"
                    [clearInput]="false"
                    [readOnly]="isReadOnly()"
                  />
                </ion-col>

                <ion-col size="12" size-md="3">
                  <bk-text-input
                    [i18n]="zipCodeI18n()"
                    [value]="zipCode()" (valueChange)="onFieldChange('zipCode', $event)"
                    [clearInput]="false"
                    [readOnly]="isReadOnly()"
                  />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <bk-text-input
                    [i18n]="cityI18n()"
                    [value]="city()" (valueChange)="onFieldChange('city', $event)"
                    [clearInput]="false"
                    [readOnly]="isReadOnly()"
                  />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6"> 
                  <bk-phone
                    [i18n]="phoneI18n()"
                    [value]="phone()" (valueChange)="onFieldChange('phone', $event)"
                    [clearInput]="false"
                    [readOnly]="isReadOnly()"
                  />
                  <bk-error-note [errors]="phoneErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-email
                    [i18n]="emailI18n()"
                    [value]="email()" (valueChange)="onFieldChange('email', $event)"
                    [clearInput]="false"
                    [readOnly]="isReadOnly()"
                  />
                  <bk-error-note [errors]="emailErrors()" />                                                                                                                     
                </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input
                    [i18n]="webI18n()"
                    [value]="web()" (valueChange)="onFieldChange('web', $event)"
                    [clearInput]="false"
                    [readOnly]="isReadOnly()"
                  />
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
          <ion-card-title>{{ i18n().misc() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input
                  [i18n]="ssnIdI18n()"
                  [value]="ssnId()" (valueChange)="onFieldChange('ssnId', $event)"
                  [maxLength]=16
                  [mask]="ssnMask"
                  [showHelper]=true
                  [readOnly]="isReadOnly()"
                  [copyable]=true
                />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input
                  [i18n]="bexioIdI18n()"
                  [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)"
                  [maxLength]=6
                  [mask]="bexioMask"
                  [showHelper]=true
                  [readOnly]="isReadOnly()"
                />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-------------------------------------- MEMBERSHIP (optional) ------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().add_membership_label() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">                               
                <bk-checkbox [i18n]="shouldAddMembershipI18n()" [checked]="shouldAddMembership()" (checkedChange)="onFieldChange('shouldAddMembership', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            @if(shouldAddMembership()) {
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
                  <bk-cat-select [category]="membershipCategories()" [selectedItemName]="currentMembershipCategoryItem()" (selectedItemNameChange)="onFieldChange('membershipCategory', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <bk-date-input [i18n]="dateOfEntryI18n()" [storeDate]="dateOfEntry()" (storeDateChange)="onFieldChange('dateOfEntry', $event)" [readOnly]="isReadOnly()" />
                </ion-col>      
              </ion-row>
            }
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
export class PersonNewForm {
  // inputs
  public readonly i18n = input.required<PersonI18n>();
  public readonly formData = model.required<PersonNewFormModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly showAddressInputs = input(true);
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly genders = input.required<CategoryListModel>();
  public readonly locale = input<string>(DEFAULT_LOCALE);
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // composed i18n objects for child inputs
  protected firstNameI18n    = computed(() => ({ name: 'firstName',    label: this.i18n().firstName_label(),    placeholder: this.i18n().firstName_placeholder(),    helper: this.i18n().firstName_helper()    } as TextInputI18n));
  protected lastNameI18n     = computed(() => ({ name: 'lastName',     label: this.i18n().lastName_label(),     placeholder: this.i18n().lastName_placeholder(),     helper: this.i18n().lastName_helper()     } as TextInputI18n));
  protected streetNameI18n   = computed(() => ({ name: 'streetName',   label: this.i18n().streetName_label(),   placeholder: this.i18n().streetName_placeholder(),   helper: this.i18n().streetName_helper()   } as TextInputI18n));
  protected streetNumberI18n = computed(() => ({ name: 'streetNumber', label: this.i18n().streetNumber_label(), placeholder: this.i18n().streetNumber_placeholder(), helper: this.i18n().streetNumber_helper() } as TextInputI18n));
  protected countryCodeI18n  = computed(() => ({ name: 'countryCode',  label: this.i18n().countryCode_label(),  placeholder: this.i18n().countryCode_placeholder(),  helper: this.i18n().countryCode_helper()  } as TextInputI18n));
  protected zipCodeI18n      = computed(() => ({ name: 'zipCode',      label: this.i18n().zipCode_label(),      placeholder: this.i18n().zipCode_placeholder(),      helper: this.i18n().zipCode_helper()      } as TextInputI18n));
  protected cityI18n         = computed(() => ({ name: 'city',         label: this.i18n().city_label(),         placeholder: this.i18n().city_placeholder(),         helper: this.i18n().city_helper()         } as TextInputI18n));
  protected webI18n          = computed(() => ({ name: 'web',          label: this.i18n().web_label(),          placeholder: this.i18n().web_placeholder(),          helper: this.i18n().web_helper()          } as TextInputI18n));
  protected ssnIdI18n        = computed(() => ({ name: 'ssnId',        label: this.i18n().ssnId_label(),        placeholder: this.i18n().ssnId_placeholder(),        helper: this.i18n().ssnId_helper()        } as TextInputI18n));
  protected bexioIdI18n      = computed(() => ({ name: 'bexioId',      label: this.i18n().bexioId_label(),      placeholder: this.i18n().bexioId_placeholder(),      helper: this.i18n().bexioId_helper()      } as TextInputI18n));
  protected notesI18n        = computed(() => ({ name: 'notes',  label: this.i18n().notes_label(),  placeholder: this.i18n().notes_placeholder()  } as NotesInputI18n));
  protected emailI18n        = computed(() => ({ name: 'email',  label: this.i18n().email_label(),  placeholder: this.i18n().email_placeholder()  } as EmailInputI18n));
  protected phoneI18n        = computed(() => ({ name: 'phone',  label: this.i18n().phone_label(),  placeholder: this.i18n().phone_placeholder()  } as PhoneInputI18n));
  protected dateOfBirthI18n  = computed(() => ({ name: 'dateOfBirth',  label: this.i18n().dateOfBirth_label(),  placeholder: this.i18n().dateOfBirth_placeholder(),  helper: this.i18n().dateOfBirth_helper()  } as DateInputI18n));
  protected dateOfDeathI18n  = computed(() => ({ name: 'dateOfDeath',  label: this.i18n().dateOfDeath_label(),  placeholder: this.i18n().dateOfDeath_placeholder(),  helper: this.i18n().dateOfDeath_helper()  } as DateInputI18n));
  protected dateOfEntryI18n         = computed(() => ({ name: 'dateOfEntry',         label: this.i18n().dateOfEntry_label(),         placeholder: this.i18n().dateOfEntry_placeholder(),         helper: this.i18n().dateOfEntry_helper()         } as DateInputI18n));
  protected shouldAddMembershipI18n = computed(() => ({ name: 'shouldAddMembership', label: this.i18n().add_membership_confirm(), helper: this.i18n().add_membership_helper() } as CheckboxI18n));

  public membershipCategories = input.required<CategoryListModel>();
  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public selectClicked = output<void>();

 // validation and errors
  protected readonly suite = personNewFormValidations;
  private readonly validationResult = computed(() => personNewFormValidations(this.formData()));
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
  protected shouldAddMembership = linkedSignal(() => this.formData().shouldAddMembership ?? false);

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
  protected currentMembershipCategoryItem = linkedSignal(() => this.formData().membershipCategory ?? '');
  protected dateOfEntry = linkedSignal(() => this.formData().dateOfEntry ?? getTodayStr());

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

  protected onFormChange(value: PersonNewFormModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormErrors('PersonNewForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('PersonNewForm.onFieldChange', this.validationResult().errors, this.currentUser());
    debugFormModel<PersonNewFormModel>('PersonNewForm', this.formData(), this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
