import { DatePipe } from '@angular/common';
import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { ChSsnMask } from '@okr/shared-config';
import { SSN_LENGTH } from '@okr/shared-constants';
import { APPLICATION_KIND_VALUES, ApplicationModel, BaseType } from '@okr/shared-models';
import {
  Checkbox, CheckboxI18n, CountrySelect, CountrySelectI18n, DateInput, DateInputI18n, EmailInput, EmailInputI18n, ErrorNote,
  NumberInput, NumberInputI18n, PhoneInput, PhoneInputI18n, RadioGroup, RadioGroupI18n, StringSelect, StringSelectI18n,
  TextInput, TextInputI18n
} from '@okr/shared-ui';
import { AhvFormat, formatAhv, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, fill, getAge } from '@okr/shared-util-core';
import {
  ApplicationI18n, applicationValidations, isMembershipApplication, needsSsn, proposeMembershipCategory, setPropertyValue
} from '@okr/application-util';

/** A membership application. The parent modal drives saving through the change-confirmation. */
@Component({
  selector: 'okr-application-form',
  standalone: true,
  imports: [
    DatePipe,
    TextInput, EmailInput, PhoneInput, DateInput, CountrySelect, RadioGroup, StringSelect, ErrorNote, Checkbox, NumberInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        @if (formData().submittedAt) {
          <ion-item lines="none">
            <ion-label>{{ i18n().submitted() }}: {{ formData().submittedAt | date:'dd.MM.yyyy HH:mm' }}</ion-label>
          </ion-item>
        }
        @if (formData().reviewedAt) {
          <ion-item lines="none">
            <ion-label>{{ i18n().reviewed() }}: {{ formData().reviewedAt | date:'dd.MM.yyyy HH:mm' }}</ion-label>
          </ion-item>
        }
        @if (formData().reviewer; as reviewer) {
          <ion-item lines="none">
            <ion-label>{{ i18n().reviewer() }}: {{ reviewer.name1 }} {{ reviewer.name2 }}</ion-label>
          </ion-item>
        }
        @if (formData().closeReason) {
          <ion-item lines="none">
            <ion-label>{{ i18n().reason() }}: {{ formData().closeReason }}</ion-label>
          </ion-item>
        }

        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().section_person() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="firstNameI18n()" [value]="firstName()" (valueChange)="onFieldChange('firstName', $event)"
                    [autofocus]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="firstNameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="lastNameI18n()" [value]="lastName()" (valueChange)="onFieldChange('lastName', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="lastNameErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-radio-group [i18n]="genderI18n()" [stringList]="genderValues" [labels]="genderLabels()"
                    [selectedString]="gender()" (selectedStringChange)="onFieldChange('gender', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="genderErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="dateOfBirthI18n()" [storeDate]="dateOfBirth()" (storeDateChange)="onFieldChange('dateOfBirth', $event)"
                    autocomplete="bday" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="dateOfBirthErrors()" />
                </ion-col>
              </ion-row>
              @if (showSsn()) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="ssnIdI18n()" [value]="ssnId()" (valueChange)="onFieldChange('ssnId', $event)"
                      [maxLength]="ssnLength" [mask]="ssnMask" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="ssnIdErrors()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().section_contact() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-email [i18n]="emailI18n()" [value]="email()" (valueChange)="onFieldChange('email', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="emailErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-phone [i18n]="phoneI18n()" [value]="phone()" (valueChange)="onFieldChange('phone', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="phoneErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().section_address() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="streetNameI18n()" [value]="streetName()" (valueChange)="onFieldChange('streetName', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="streetNameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="streetNumberI18n()" [value]="streetNumber()" (valueChange)="onFieldChange('streetNumber', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="streetNumberErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="zipCodeI18n()" [value]="zipCode()" (valueChange)="onFieldChange('zipCode', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="zipCodeErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="cityI18n()" [value]="city()" (valueChange)="onFieldChange('city', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="cityErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-country-select [i18n]="countryCodeI18n()" [value]="countryCode()" (valueChange)="onFieldChange('countryCode', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="countryCodeErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        @if (isYouth()) {
          <ion-card>
            <ion-card-header><ion-card-title>{{ i18n().section_parent() }}</ion-card-title></ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="parentFirstNameI18n()" [value]="parentFirstName()" (valueChange)="onFieldChange('parentFirstName', $event)"
                      [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="parentFirstNameErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="parentLastNameI18n()" [value]="parentLastName()" (valueChange)="onFieldChange('parentLastName', $event)"
                      [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="parentLastNameErrors()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-email [i18n]="parentEmailI18n()" [value]="parentEmail()" (valueChange)="onFieldChange('parentEmail', $event)"
                      [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="parentEmailErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-phone [i18n]="parentPhoneI18n()" [value]="parentPhone()" (valueChange)="onFieldChange('parentPhone', $event)"
                      [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }

        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().section_application() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="applicationAsI18n()" [stringList]="kindValues" [labels]="kindLabels()"
                    [selectedString]="applicationAs()" (selectedStringChange)="onFieldChange('applicationAs', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="applicationAsErrors()" />
                </ion-col>
                @if (proposal(); as proposal) {
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none">
                      <ion-note>{{ proposal }}</ion-note>
                    </ion-item>
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- answers the form builder stored as typed properties (spec 1.125 §4.4): only the value may be corrected -->
        @if (propertyRows().length > 0) {
          <ion-card>
            <ion-card-header><ion-card-title>{{ i18n().section_properties() }}</ion-card-title></ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  @for (row of propertyRows(); track row.key) {
                    <ion-col size="12" size-md="6">
                      @switch (row.type) {
                        @case ('boolean') {
                          <okr-checkbox [i18n]="row.checkboxI18n" [checked]="row.value === true"
                            (checkedChange)="onPropertyChange(row.key, $event)" [readOnly]="isReadOnly()" />
                        }
                        @case ('number') {
                          <okr-number-input [i18n]="row.numberI18n" [value]="row.numberValue"
                            (valueChange)="onPropertyChange(row.key, $event)" [readOnly]="isReadOnly()" />
                        }
                        @default {
                          <okr-text-input [i18n]="row.textI18n" [value]="row.textValue"
                            (valueChange)="onPropertyChange(row.key, $event)" [readOnly]="isReadOnly()" />
                        }
                      }
                      <okr-error-note [errors]="row.errors" />
                    </ion-col>
                  }
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }
      </form>
    }
  `
})
export class ApplicationForm {
  // inputs
  public readonly i18n = input.required<ApplicationI18n>();
  public formData = model.required<ApplicationModel>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);   // toggled by the parent to reset Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly applicationForm = form(this.formData, (path) => validateVestTree(path, applicationValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.applicationForm().valid()));
  }

  // constants for the template
  /** kept in step with the cap ssnValidations enforces on this field */
  protected readonly ssnLength = SSN_LENGTH;
  protected readonly ssnMask = ChSsnMask;
  protected readonly genderValues = ['male', 'female'];
  protected readonly kindValues: string[] = APPLICATION_KIND_VALUES;

  // state
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly isYouth = computed(() => this.formData().applicationAs === 'youth');
  protected readonly showSsn = computed(() => needsSsn(this.formData()));
  /** the member category the application suggests — shown only, never written (spec 1.125 §13.1) */
  protected readonly proposal = computed(() => {
    const app = this.formData();
    if (!isMembershipApplication(app) || getAge(app.dateOfBirth ?? '') < 0) return '';
    const labels = {
      junior: this.i18n().proposal_junior(),
      active: this.i18n().proposal_active(),
      candidate: this.i18n().proposal_candidate(),
    };
    return fill(this.i18n().proposal_label(), { category: labels[proposeMembershipCategory(app)] });
  });

  // fields
  protected readonly firstName = computed(() => this.formData().firstName ?? '');
  protected readonly lastName = computed(() => this.formData().lastName ?? '');
  protected readonly gender = computed(() => this.formData().gender ?? '');
  protected readonly dateOfBirth = computed(() => this.formData().dateOfBirth ?? '');
  protected readonly ssnId = computed(() => formatAhv(this.formData().ssnId ?? '', AhvFormat.Friendly));
  protected readonly email = computed(() => this.formData().email ?? '');
  protected readonly phone = computed(() => this.formData().phone ?? '');
  protected readonly streetName = computed(() => this.formData().streetName ?? '');
  protected readonly streetNumber = computed(() => this.formData().streetNumber ?? '');
  protected readonly zipCode = computed(() => this.formData().zipCode ?? '');
  protected readonly city = computed(() => this.formData().city ?? '');
  protected readonly countryCode = computed(() => this.formData().countryCode ?? '');
  protected readonly parentFirstName = computed(() => this.formData().parentFirstName ?? '');
  protected readonly parentLastName = computed(() => this.formData().parentLastName ?? '');
  protected readonly parentEmail = computed(() => this.formData().parentEmail ?? '');
  protected readonly parentPhone = computed(() => this.formData().parentPhone ?? '');
  protected readonly applicationAs = computed(() => this.formData().applicationAs ?? '');

  // errors
  private readonly validationResult = vestErrors(this.applicationForm);
  protected readonly firstNameErrors = computed(() => this.validationResult().getErrors('firstName'));
  protected readonly lastNameErrors = computed(() => this.validationResult().getErrors('lastName'));
  protected readonly genderErrors = computed(() => this.validationResult().getErrors('gender'));
  protected readonly dateOfBirthErrors = computed(() => this.validationResult().getErrors('dateOfBirth'));
  protected readonly ssnIdErrors = computed(() => this.validationResult().getErrors('ssnId'));
  protected readonly emailErrors = computed(() => this.validationResult().getErrors('email'));
  protected readonly phoneErrors = computed(() => this.validationResult().getErrors('phone'));
  protected readonly streetNameErrors = computed(() => this.validationResult().getErrors('streetName'));
  protected readonly streetNumberErrors = computed(() => this.validationResult().getErrors('streetNumber'));
  protected readonly zipCodeErrors = computed(() => this.validationResult().getErrors('zipCode'));
  protected readonly cityErrors = computed(() => this.validationResult().getErrors('city'));
  protected readonly countryCodeErrors = computed(() => this.validationResult().getErrors('countryCode'));
  protected readonly parentFirstNameErrors = computed(() => this.validationResult().getErrors('parentFirstName'));
  protected readonly parentLastNameErrors = computed(() => this.validationResult().getErrors('parentLastName'));
  protected readonly parentEmailErrors = computed(() => this.validationResult().getErrors('parentEmail'));
  protected readonly applicationAsErrors = computed(() => this.validationResult().getErrors('applicationAs'));

  // typed properties — legacy applications have none (Firestore reads skip the model initialiser)
  protected readonly propertyRows = computed(() => (this.formData().properties ?? []).map((p, index) => ({
    key: p.key,
    type: p.type,
    value: p.value,
    numberValue: p.value as number,
    textValue: p.value === undefined || p.value === null ? '' : String(p.value),
    checkboxI18n: { name: p.key, label: p.label, helper: '' } as CheckboxI18n,
    numberI18n: { name: p.key, label: p.label, placeholder: '', helper: '' } as NumberInputI18n,
    textI18n: this.textI18n(p.key, p.label),
    errors: this.validationResult().getErrors(`properties[${index}].value`),
  })));

  // i18n — adapted at the shared/ui boundary
  protected readonly firstNameI18n = computed(() => this.textI18n('firstName', this.i18n().firstname()));
  protected readonly lastNameI18n = computed(() => this.textI18n('lastName', this.i18n().lastname()));
  protected readonly ssnIdI18n = computed(() => this.textI18n('ssnId', this.i18n().ssn()));
  protected readonly streetNameI18n = computed(() => this.textI18n('streetName', this.i18n().street_name()));
  protected readonly streetNumberI18n = computed(() => this.textI18n('streetNumber', this.i18n().street_number()));
  protected readonly zipCodeI18n = computed(() => this.textI18n('zipCode', this.i18n().zip_code()));
  protected readonly cityI18n = computed(() => this.textI18n('city', this.i18n().city()));
  protected readonly parentFirstNameI18n = computed(() => this.textI18n('parentFirstName', this.i18n().parent_first_name()));
  protected readonly parentLastNameI18n = computed(() => this.textI18n('parentLastName', this.i18n().parent_last_name()));
  protected readonly emailI18n = computed(() => ({ name: 'email', label: this.i18n().email(), placeholder: '' } as EmailInputI18n));
  protected readonly parentEmailI18n = computed(() => ({ name: 'parentEmail', label: this.i18n().parent_email(), placeholder: '' } as EmailInputI18n));
  protected readonly phoneI18n = computed(() => ({ name: 'phone', label: this.i18n().phone(), placeholder: '' } as PhoneInputI18n));
  protected readonly parentPhoneI18n = computed(() => ({ name: 'parentPhone', label: this.i18n().parent_phone(), placeholder: '' } as PhoneInputI18n));
  protected readonly dateOfBirthI18n = computed(() => ({ name: 'dateOfBirth', label: this.i18n().date_of_birth(), placeholder: '' } as DateInputI18n));
  protected readonly countryCodeI18n = computed(() => ({ name: 'countryCode', label: this.i18n().country_code() } as CountrySelectI18n));
  protected readonly genderI18n = computed(() => ({ name: 'gender', label: this.i18n().gender() } as RadioGroupI18n));
  protected readonly genderLabels = computed(() => [this.i18n().gender_male(), this.i18n().gender_female()]);
  protected readonly applicationAsI18n = computed(() => ({ name: 'applicationAs', label: this.i18n().application() } as StringSelectI18n));
  protected readonly kindLabels = computed(() => [this.i18n().kind_youth(), this.i18n().kind_adult(), this.i18n().kind_transfer()]);

  protected onFieldChange(fieldName: keyof ApplicationModel, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onPropertyChange(key: string, value: BaseType | null): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, properties: setPropertyValue(vm.properties, key, value) }));
  }

  private textI18n(name: string, label: string): TextInputI18n {
    return { name, label, placeholder: '', helper: '' };
  }
}
