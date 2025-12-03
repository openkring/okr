import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChSsnMask } from '@bk2/shared-config';
import { CategoryListModel, PrivacyAccessor, PrivacySettings, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, isVisibleToUser } from '@bk2/shared-util-core';
import { PERSON_FORM_SHAPE, PersonFormModel, personFormValidations } from '@bk2/subject-person-util';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

@Component({
  selector: 'bk-person-form',
  standalone: true,
  imports: [
    vestForms,
    FormsModule,
    TextInputComponent, DateInputComponent, CategorySelectComponent, ChipsComponent, NotesInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (formValueChange)="onFormChange($event)">

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row> 
              <ion-col size="12" size-md="6">
                <bk-text-input name="firstName" [value]="firstName()" autocomplete="given-name" [autofocus]="true" [maxLength]=30 [readOnly]="isReadOnly()" (changed)="onFieldChange('firstName', $event)" />                                        
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="lastName" [value]="lastName()" autocomplete="family-name" [maxLength]=30 [readOnly]="isReadOnly()" (changed)="onFieldChange('lastName', $event)" />                                        
              </ion-col>
            </ion-row>

            <!-- tbd: these role checks are currently only checking against the default
            they need to be extended to consider the settings of this person's user -->
            @if(isVisibleToUser(priv().showDateOfBirth) || isVisibleToUser(priv().showDateOfDeath)) {
              <ion-row>
                @if(isVisibleToUser(priv().showDateOfBirth)) {
                  <ion-col size="12" size-md="6"> 
                    <bk-date-input name="dateOfBirth" [storeDate]="dateOfBirth()" autocomplete="bday" [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfBirth', $event)" />
                  </ion-col>
                }

                @if(isDeathDateVisible()) {
                  <ion-col size="12" size-md="6">
                    <bk-date-input name="dateOfDeath"  [storeDate]="dateOfDeath()" [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfDeath', $event)" />
                  </ion-col>
                }
              </ion-row>
            }

            <ion-row>
              @if(isVisibleToUser(priv().showGender)) {
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="genders()!" [selectedItemName]="gender()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('gender', $event)" />
                </ion-col>
              }
      
              @if(isVisibleToUser(priv().showTaxId)) {
                <ion-col size="12" size-md="6">
                  <bk-text-input name="ssnId" [value]="ssnId()" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [copyable]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('ssnId', $event)" />                                        
                </ion-col>
              }
              @if(isVisibleToUser(priv().showBexioId)) {
                <ion-col size="12" size-md="6">
                  <bk-text-input name="bexioId" [value]="bexioId()" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('bexioId', $event)" />                                        
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(isTagsVisible()) {
        <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
      }
      
      @if(isNotesVisible()) {
        <bk-notes [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
      }
    </form>
  `
})
export class PersonFormComponent {  
  // inputs
  public formData = model.required<PersonFormModel>();
  public currentUser = input<UserModel | undefined>();
  public allTags = input.required<string>();
  public priv = input.required<PrivacySettings>();
  public genders = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = personFormValidations;
  protected readonly shape = PERSON_FORM_SHAPE;
  private readonly validationResult = computed(() => personFormValidations(this.formData()));
  protected lastNameErrors = computed(() => this.validationResult().getErrors('lastName'));

  // fields
  protected firstName = computed(() => this.formData().firstName ?? DEFAULT_NAME);
  protected lastName = computed(() => this.formData().lastName ?? DEFAULT_NAME);
  protected dateOfBirth = computed(() => this.formData().dateOfBirth ?? DEFAULT_DATE);
  protected dateOfDeath = computed(() => this.formData().dateOfDeath ?? DEFAULT_DATE);
  protected gender = computed(() => this.formData().gender ?? DEFAULT_GENDER);
  protected ssnId = computed(() => this.formData().ssnId ?? DEFAULT_ID);
  protected bexioId = computed(() => this.formData().bexioId ?? DEFAULT_ID);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected ssnMask = ChSsnMask;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: PersonFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('PersonForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('PersonForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected isVisibleToUser(privacyAccessor: PrivacyAccessor): boolean {
    return isVisibleToUser(privacyAccessor, this.currentUser());
  }

  protected isDeathDateVisible(): boolean {
    if (!this.isReadOnly()) return true;
    if (!isVisibleToUser(this.priv().showDateOfDeath, this.currentUser())) return false;
    return this.dateOfDeath().length > 0 ? true : false;
  }
  protected isTagsVisible(): boolean {
    if (!this.isReadOnly()) return true;
    if (!isVisibleToUser(this.priv().showTags, this.currentUser())) return false;
    return (this.tags() && this.tags().length > 0) ? true : false;
  }
    protected isNotesVisible(): boolean {
    if (!this.isReadOnly()) return true;
    if (!isVisibleToUser(this.priv().showNotes, this.currentUser())) return false;
    return (this.notes() && this.notes().length > 0) ? true : false;
  }
}
