import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChSsnMask } from '@bk2/shared-config';
import { CategoryListModel, PersonModel, PrivacyAccessor, PrivacySettings, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { areNotesVisible, areTagsVisible, coerceBoolean, debugFormErrors, debugFormModel, hasRole, isVisibleToUser } from '@bk2/shared-util-core';
import { personValidations } from '@bk2/subject-person-util';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { AhvFormat, formatAhv } from '@bk2/shared-util-angular';
import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';

@Component({
  selector: 'bk-person-form',
  standalone: true,
  imports: [
    vestForms,
    FormsModule,
    TextInput, DateInput, CategorySelect, Chips, NotesInput,
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
            @if(hasRole('admin')) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                </ion-col>
              </ion-row>
            }
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="firstNameI18n()" [value]="firstName()" (valueChange)="onFieldChange('firstName', $event)" autocomplete="given-name" [autofocus]="true" [maxLength]=30 [readOnly]="isReadOnly()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="lastNameI18n()" [value]="lastName()" (valueChange)="onFieldChange('lastName', $event)" autocomplete="family-name" [maxLength]=30 [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>

            @if(isVisibleToUser('dob', priv().showDateOfBirth) || isVisibleToUser('dod', priv().showDateOfDeath)) {
              <ion-row>
                @if(isVisibleToUser('dob', priv().showDateOfBirth)) {
                  <ion-col size="12" size-md="6"> 
                    <bk-date-input [i18n]="dateOfBirthI18n()" [storeDate]="dateOfBirth()" (storeDateChange)="onFieldChange('dateOfBirth', $event)" autocomplete="bday" [readOnly]="isReadOnly()" />
                  </ion-col>
                }

                @if(isDeathDateVisible()) {
                  <ion-col size="12" size-md="6">
                    <bk-date-input [i18n]="dateOfDeathI18n()" [storeDate]="dateOfDeath()" (storeDateChange)="onFieldChange('dateOfDeath', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
              </ion-row>
            }

            <ion-row>
              @if(isVisibleToUser('gender', priv().showGender)) {
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="genders()!" [selectedItemName]="gender()" (selectedItemNameChange)="onFieldChange('gender', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                </ion-col>
              }
      
              @if(isVisibleToUser('taxId', priv().showTaxId)) {
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="ssnIdI18n()" [value]="ssnId()" (valueChange)="onFieldChange('ssnId', $event)" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [copyable]=true [readOnly]="isReadOnly()" />
                </ion-col>
              }
              @if(isVisibleToUser('bexioId', priv().showBexioId)) {
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="bexioIdI18n()" [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" />
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(areTagsVisible()) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }
      
      @if(hasRole('admin')) {
        <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
  `
})
export class PersonForm {
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    bkey_label:            PFX + 'bkey.label',
    bkey_placeholder:      PFX + 'bkey.placeholder',
    bkey_helper:           PFX + 'bkey.helper',
    firstName_label:       PFX + 'firstName.label',
    firstName_placeholder: PFX + 'firstName.placeholder',
    firstName_helper:      PFX + 'firstName.helper',
    lastName_label:        PFX + 'lastName.label',
    lastName_placeholder:  PFX + 'lastName.placeholder',
    lastName_helper:       PFX + 'lastName.helper',
    ssnId_label:           PFX + 'ssnId.label',
    ssnId_placeholder:     PFX + 'ssnId.placeholder',
    ssnId_helper:          PFX + 'ssnId.helper',
    bexioId_label:         PFX + 'bexioId.label',
    bexioId_placeholder:   PFX + 'bexioId.placeholder',
    bexioId_helper:        PFX + 'bexioId.helper',
    notes_label:           PFX + 'notes.label',
    notes_placeholder:     PFX + 'notes.placeholder',
    dateOfBirth_label:     PFX + 'dateOfBirth.label',
    dateOfBirth_placeholder: PFX + 'dateOfBirth.placeholder',
    dateOfBirth_helper:    PFX + 'dateOfBirth.helper',
    dateOfDeath_label:     PFX + 'dateOfDeath.label',
    dateOfDeath_placeholder: PFX + 'dateOfDeath.placeholder',
    dateOfDeath_helper:    PFX + 'dateOfDeath.helper',
  });
  protected bkeyI18n = computed(() => ({ name: 'bkey', label: this.fieldI18n.bkey_label(), placeholder: this.fieldI18n.bkey_placeholder(), helper: this.fieldI18n.bkey_helper() } as TextInputI18n));
  protected firstNameI18n = computed(() => ({ name: 'firstName', label: this.fieldI18n.firstName_label(), placeholder: this.fieldI18n.firstName_placeholder(), helper: this.fieldI18n.firstName_helper() } as TextInputI18n));
  protected lastNameI18n = computed(() => ({ name: 'lastName', label: this.fieldI18n.lastName_label(), placeholder: this.fieldI18n.lastName_placeholder(), helper: this.fieldI18n.lastName_helper() } as TextInputI18n));
  protected ssnIdI18n = computed(() => ({ name: 'ssnId', label: this.fieldI18n.ssnId_label(), placeholder: this.fieldI18n.ssnId_placeholder(), helper: this.fieldI18n.ssnId_helper() } as TextInputI18n));
  protected bexioIdI18n = computed(() => ({ name: 'bexioId', label: this.fieldI18n.bexioId_label(), placeholder: this.fieldI18n.bexioId_placeholder(), helper: this.fieldI18n.bexioId_helper() } as TextInputI18n));
  protected notesI18n = computed(() => ({ name: 'notes', label: this.fieldI18n.notes_label(), placeholder: this.fieldI18n.notes_placeholder() } as NotesInputI18n));
  protected dateOfBirthI18n = computed(() => ({ name: 'dateOfBirth', label: this.fieldI18n.dateOfBirth_label(), placeholder: this.fieldI18n.dateOfBirth_placeholder(), helper: this.fieldI18n.dateOfBirth_helper() } as DateInputI18n));
  protected dateOfDeathI18n = computed(() => ({ name: 'dateOfDeath', label: this.fieldI18n.dateOfDeath_label(), placeholder: this.fieldI18n.dateOfDeath_placeholder(), helper: this.fieldI18n.dateOfDeath_helper() } as DateInputI18n));

  // inputs
  public readonly formData = model.required<PersonModel>();
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

  // validation and errors
  protected readonly suite = personValidations;
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
  protected bkey = computed(() => this.formData().bkey ?? '');
  protected areNotesVisible = computed(() => areNotesVisible(this.currentUser(), this.priv(), this.notes(), this.isReadOnly()));

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected ssnMask = ChSsnMask;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: PersonModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('PersonForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('PersonForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected isVisibleToUser(_field: string, privacyAccessor: PrivacyAccessor): boolean {
    return isVisibleToUser(privacyAccessor, this.currentUser());
  }

  protected isDeathDateVisible(): boolean {
    if (!this.isReadOnly()) return true;
    if (!isVisibleToUser(this.priv().showDateOfDeath, this.currentUser())) return false;
    return this.dateOfDeath().length > 0 ? true : false;
  }

  protected areTagsVisible(): boolean {
    return areTagsVisible(this.currentUser(), this.priv(), this.tags(), this.isReadOnly());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
