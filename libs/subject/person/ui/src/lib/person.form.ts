import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { BexioIdMask, ChSsnMask } from '@okr/shared-config';
import { CategoryListModel, PrivacyAccessor, PrivacySettings, RoleName, UserModel } from '@okr/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { areNotesVisible, areTagsVisible, coerceBoolean, hasRole, isSensitiveFieldVisible, isVisibleToUser } from '@okr/shared-util-core';
import { PersonFormModel, personValidations, PersonI18n } from '@okr/subject-person-util';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@okr/shared-constants';
import { AhvFormat, formatAhv } from '@okr/shared-util-angular';

@Component({
  selector: 'okr-person-form',
  standalone: true,
  imports: [
    TextInput, DateInput, CategorySelect, Chips, NotesInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form novalidate>

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            @if(hasRole('admin')) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="okeyI18n()" [value]="okey()" [readOnly]="true" [copyable]="true" />
                </ion-col>
              </ion-row>
            }
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="firstNameI18n()" [value]="firstName()" (valueChange)="onFieldChange('firstName', $event)" autocomplete="given-name" [autofocus]="true" [maxLength]=30 [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="lastNameI18n()" [value]="lastName()" (valueChange)="onFieldChange('lastName', $event)" autocomplete="family-name" [maxLength]=30 [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            @if(isSensitiveVisibleToUser(priv().showDateOfBirth) || isSensitiveVisibleToUser(priv().showDateOfDeath)) {
              <ion-row>
                @if(isSensitiveVisibleToUser(priv().showDateOfBirth)) {
                  <ion-col size="12" size-md="6"> 
                    <okr-date-input [i18n]="dateOfBirthI18n()" [storeDate]="dateOfBirth()" (storeDateChange)="onFieldChange('dateOfBirth', $event)" autocomplete="bday" [readOnly]="isReadOnly()" />
                  </ion-col>
                }

                @if(isDeathDateVisible()) {
                  <ion-col size="12" size-md="6">
                    <okr-date-input [i18n]="dateOfDeathI18n()" [storeDate]="dateOfDeath()" (storeDateChange)="onFieldChange('dateOfDeath', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
              </ion-row>
            }

            <ion-row>
              @if(isVisibleToUser('gender', priv().showGender)) {
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="genders()!" [selectedItemName]="gender()" (selectedItemNameChange)="onFieldChange('gender', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                </ion-col>
              }
      
              @if(isSensitiveVisibleToUser(priv().showTaxId)) {
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="ssnIdI18n()" [value]="ssnId()" (valueChange)="onFieldChange('ssnId', $event)" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [copyable]=true [readOnly]="isReadOnly()" />
                </ion-col>
              }
              @if(isVisibleToUser('bexioId', priv().showBexioId)) {
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="bexioIdI18n()" [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" />
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(areTagsVisible()) {
        <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }
      
      @if(hasRole('admin')) {
        <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
  `
})
export class PersonForm {
  public readonly i18n = input.required<PersonI18n>();
  protected okeyI18n = computed(() => ({ name: 'okey', label: this.i18n().okey_label(), placeholder: this.i18n().okey_placeholder(), helper: this.i18n().okey_helper() } as TextInputI18n));
  protected firstNameI18n = computed(() => ({ name: 'firstName', label: this.i18n().firstName_label(), placeholder: this.i18n().firstName_placeholder(), helper: this.i18n().firstName_helper() } as TextInputI18n));
  protected lastNameI18n = computed(() => ({ name: 'lastName', label: this.i18n().lastName_label(), placeholder: this.i18n().lastName_placeholder(), helper: this.i18n().lastName_helper() } as TextInputI18n));
  protected ssnIdI18n = computed(() => ({ name: 'ssnId', label: this.i18n().ssnId_label(), placeholder: this.i18n().ssnId_placeholder(), helper: this.i18n().ssnId_helper() } as TextInputI18n));
  protected bexioIdI18n = computed(() => ({ name: 'bexioId', label: this.i18n().bexioId_label(), placeholder: this.i18n().bexioId_placeholder(), helper: this.i18n().bexioId_helper() } as TextInputI18n));
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected dateOfBirthI18n = computed(() => ({ name: 'dateOfBirth', label: this.i18n().dateOfBirth_label(), placeholder: this.i18n().dateOfBirth_placeholder(), helper: this.i18n().dateOfBirth_helper() } as DateInputI18n));
  protected dateOfDeathI18n = computed(() => ({ name: 'dateOfDeath', label: this.i18n().dateOfDeath_label(), placeholder: this.i18n().dateOfDeath_placeholder(), helper: this.i18n().dateOfDeath_helper() } as DateInputI18n));

  // inputs
  public readonly formData = model.required<PersonFormModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly priv = input.required<PrivacySettings>();
  public readonly genders = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  constructor() { effect(() => this.valid.emit(this.validationResult().isValid())); }

  // validation and errors
  private readonly validationResult = computed(() => personValidations(this.formData(), this.tenantId(), this.allTags()));
  protected lastNameErrors = computed(() => this.validationResult().getErrors('lastName'));

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
  protected okey = computed(() => this.formData().okey ?? '');
  protected areNotesVisible = computed(() => areNotesVisible(this.currentUser(), this.priv(), this.notes(), this.isReadOnly()));

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected ssnMask = ChSsnMask;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected isVisibleToUser(_field: string, privacyAccessor: PrivacyAccessor): boolean {
    return isVisibleToUser(privacyAccessor, this.currentUser());
  }

  /**
   * Gate for the vault-backed sensitive fields (dob, ssn — spec 1.19 D9): the tenant floor
   * plus an explicit memberAdmin grant, because memberAdmin maintains these values but has
   * no rung on the PrivacyAccessor ladder.
   */
  protected isSensitiveVisibleToUser(privacyAccessor: PrivacyAccessor): boolean {
    return isSensitiveFieldVisible(privacyAccessor, this.currentUser());
  }

  protected isDeathDateVisible(): boolean {
    if (!isSensitiveFieldVisible(this.priv().showDateOfDeath, this.currentUser())) return false;
    if (!this.isReadOnly()) return true;
    return this.dateOfDeath().length > 0 ? true : false;
  }

  protected areTagsVisible(): boolean {
    return areTagsVisible(this.currentUser(), this.priv(), this.tags(), this.isReadOnly());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
