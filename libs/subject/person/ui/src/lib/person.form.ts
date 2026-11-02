import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { BexioIdMask, ChSsnMask } from '@okr/shared-config';
import { BaseProperty, CategoryListModel, PrivacyAccessor, PrivacySettings, RoleName, UserModel } from '@okr/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, PropertyList, PropertyListI18n, TextInput, TextInputI18n , ErrorNote} from '@okr/shared-ui';
import { areNotesVisible, areTagsVisible, coerceBoolean, hasRole, isVaultFieldVisible, isVisibleToUser } from '@okr/shared-util-core';
import { externalIdKeyOptions, fromProperties, PersonFormModel, personValidations, PersonI18n, toProperties } from '@okr/subject-person-util';
import { BEXIO_ID_LENGTH, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AhvFormat, formatAhv, validateVestTree, vestErrors } from '@okr/shared-util-angular';

@Component({
  selector: 'okr-person-form',
  standalone: true,
  imports: [
    ErrorNote,
    TextInput, DateInput, CategorySelect, Chips, NotesInput, PropertyList,
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
                <okr-text-input [i18n]="firstNameI18n()" [value]="firstName()" (valueChange)="onFieldChange('firstName', $event)" autocomplete="given-name" [autofocus]="true" [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="firstNameErrors()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="lastNameI18n()" [value]="lastName()" (valueChange)="onFieldChange('lastName', $event)" autocomplete="family-name" [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="lastNameErrors()" />
              </ion-col>
            </ion-row>

            @if(isVaultFieldVisible('dob') || isVaultFieldVisible('dod')) {
              <ion-row>
                @if(isVaultFieldVisible('dob')) {
                  <ion-col size="12" size-md="6"> 
                    <okr-date-input [i18n]="dateOfBirthI18n()" [storeDate]="dateOfBirth()" (storeDateChange)="onFieldChange('dateOfBirth', $event)" autocomplete="bday" [readOnly]="isReadOnly()" [allowPartial]="true" />
                    <okr-error-note [errors]="dateOfBirthErrors()" />
                  </ion-col>
                }

                @if(isDeathDateVisible()) {
                  <ion-col size="12" size-md="6">
                    <okr-date-input [i18n]="dateOfDeathI18n()" [storeDate]="dateOfDeath()" (storeDateChange)="onFieldChange('dateOfDeath', $event)" [readOnly]="isReadOnly()" [allowPartial]="true" />
                    <okr-error-note [errors]="dateOfDeathErrors()" />
                  </ion-col>
                }
              </ion-row>
            }

            <ion-row>
              @if(isVisibleToUser('gender', priv().showGender)) {
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="genders()!" [selectedItemName]="gender()" (selectedItemNameChange)="onFieldChange('gender', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="genderErrors()" />
                </ion-col>
              }
      
              @if(isVaultFieldVisible('ssn')) {
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="ssnIdI18n()" [value]="ssnId()" (valueChange)="onFieldChange('ssnId', $event)" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [copyable]=true [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="ssnIdErrors()" />
                </ion-col>
              }
              @if(isVisibleToUser('bexioId', priv().showBexioId)) {
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="bexioIdI18n()" [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)" [maxLength]="bexioIdLength" [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="bexioIdErrors()" />
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(areExternalIdsVisible()) {
        <okr-property-list
          [properties]="externalIdProperties()"
          (propertiesChange)="onExternalIdsChange($event)"
          [i18n]="externalIdsI18n()"
          [keyOptions]="externalIdKeys()"
          [readOnly]="isReadOnly()"
          [reorderable]="false" />
        <okr-error-note [errors]="externalIdsErrors()" />
      }

      @if(areTagsVisible()) {
        <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }
      
      @if(hasRole('admin')) {
        <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="notesErrors()" />
      }
    </form>
  }
  `
})
export class PersonForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly bexioIdLength = BEXIO_ID_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
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
  /** the books (accountingTenantIds) a scoped external id, e.g. a bexio contact, can belong to */
  public readonly accountingTenantIds = input<string[]>([]);
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  constructor() { effect(() => this.valid.emit(this.personForm().valid())); }

  // validation and errors
  // The suite needs tenantId and allTags, which validateVestTree does not pass — so the bridge
  // calls it through a closure that adds them.
  private readonly suiteWithContext = (model: PersonFormModel) =>
    personValidations(model, this.tenantId(), this.allTags());
  protected readonly personForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = vestErrors(this.personForm);
  protected dateOfBirthErrors = computed(() => this.validationResult().getErrors('dateOfBirth'));
  protected dateOfDeathErrors = computed(() => this.validationResult().getErrors('dateOfDeath'));
  protected genderErrors = computed(() => this.validationResult().getErrors('gender'));
  protected bexioIdErrors = computed(() => this.validationResult().getErrors('bexioId'));
  protected firstNameErrors = computed(() => this.validationResult().getErrors('firstName'));
  protected notesErrors = computed(() => this.validationResult().getErrors('notes'));
  protected ssnIdErrors = computed(() => this.validationResult().getErrors('ssnId'));
  protected lastNameErrors = computed(() => this.validationResult().getErrors('lastName'));
  protected externalIdsErrors = computed(() => this.validationResult().getErrors('externalIds'));

  // fields
  protected readonly firstName = computed(() => this.formData().firstName ?? DEFAULT_NAME);
  protected readonly lastName = computed(() => this.formData().lastName ?? DEFAULT_NAME);
  protected readonly dateOfBirth = computed(() => this.formData().dateOfBirth ?? DEFAULT_DATE);
  protected readonly dateOfDeath = computed(() => this.formData().dateOfDeath ?? DEFAULT_DATE);
  protected readonly gender = computed(() => this.formData().gender ?? DEFAULT_GENDER);
  protected readonly ssnId = computed(() => formatAhv(this.formData().ssnId ?? '', AhvFormat.Friendly));
  protected readonly bexioId = computed(() => this.formData().bexioId ?? DEFAULT_ID);
  protected readonly tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected readonly notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);
  protected okey = computed(() => this.formData().okey ?? '');
  protected areNotesVisible = computed(() => areNotesVisible(this.currentUser(), this.priv(), this.notes(), this.isReadOnly()));

  // external ids (spec 1.132 D15): the map is edited as a key/value list; the keys are picked, not typed
  protected externalIdProperties = computed(() => toProperties(this.formData().externalIds));
  protected externalIdsI18n = computed(() => ({
    title: this.i18n().externalIds_title(),
    empty: this.i18n().externalIds_empty(),
    keyLabel: this.i18n().externalIds_key(),
    valueLabel: this.i18n().externalIds_value(),
    add: this.i18n().externalIds_add()
  } as PropertyListI18n));
  protected externalIdKeys = computed(() => externalIdKeyOptions(
    { js: this.i18n().externalId_js(), bexio: this.i18n().externalId_bexio() },
    this.accountingTenantIds(),
    Object.keys(this.formData().externalIds ?? {})));

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected ssnMask = ChSsnMask;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | Record<string, string>): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  /**
   * Invalid entries are kept (`keepInvalid`) so the Vest suite reports them instead of them vanishing on save.
   * Skips the write when nothing changed, so opening a person never marks the form dirty.
   */
  protected onExternalIdsChange(properties: BaseProperty[]): void {
    const next = fromProperties(properties, true);
    const current = this.formData().externalIds ?? {};
    const sameKeys = Object.keys(next).length === Object.keys(current).length && Object.entries(next).every(([k, v]) => current[k] === v);
    if (sameKeys) return;
    this.onFieldChange('externalIds', next);
  }

  /**
   * The J+S number is an identifier, often of minors. The person document is tenant-readable, so this is a
   * display gate, not access control — it follows `bexioId`, the comparable identifier, and so shows it to
   * no wider an audience. A read-only view hides an empty list; editing follows the form's `readOnly`.
   */
  protected areExternalIdsVisible(): boolean {
    if (!this.isVisibleToUser('bexioId', this.priv().showBexioId)) return false;
    return !this.isReadOnly() || this.externalIdProperties().length > 0;
  }

  protected isVisibleToUser(_field: string, privacyAccessor: PrivacyAccessor): boolean {
    return isVisibleToUser(privacyAccessor, this.currentUser());
  }

  /**
   * Gate for the vault-backed sensitive fields (ssn/dob/dod — spec 1.19 D9). Delegates to
   * the full §A3 formula (channel floor ∧ this person's usage* preference ∧ tenant floor,
   * with an owner/memberAdmin bypass), which is what PersonService.loadSensitive can
   * actually deliver — gating on the tenant floor alone drew fields that stayed empty.
   */
  protected isVaultFieldVisible(channel: string): boolean {
    return isVaultFieldVisible(channel, this.formData(), this.priv(), this.currentUser());
  }

  protected isDeathDateVisible(): boolean {
    if (!this.isVaultFieldVisible('dod')) return false;
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
