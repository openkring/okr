import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChSsnMask } from '@bk2/shared-config';
import { CategoryListModel, PersonModel, PrivacyAccessor, PrivacySettings, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, isVisibleToUser } from '@bk2/shared-util-core';
import { personValidations } from '@bk2/subject-person-util';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { AhvFormat, formatAhv } from '@bk2/shared-util-angular';

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
            <ion-row> 
              <ion-col size="12" size-md="6">
                <bk-text-input name="firstName" [value]="firstName()" (valueChange)="onFieldChange('firstName', $event)" autocomplete="given-name" [autofocus]="true" [maxLength]=30 [readOnly]="isReadOnly()" />                                        
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="lastName" [value]="lastName()" (valueChange)="onFieldChange('lastName', $event)" autocomplete="family-name" [maxLength]=30 [readOnly]="isReadOnly()" />                                        
              </ion-col>
            </ion-row>

            <!-- tbd: these role checks are currently only checking against the default
            they need to be extended to consider the settings of this person's user -->
            @if(isVisibleToUser(priv().showDateOfBirth) || isVisibleToUser(priv().showDateOfDeath)) {
              <ion-row>
                @if(isVisibleToUser(priv().showDateOfBirth)) {
                  <ion-col size="12" size-md="6"> 
                    <bk-date-input name="dateOfBirth" [storeDate]="dateOfBirth()" (storeDateChange)="onFieldChange('dateOfBirth', $event)" autocomplete="bday" [readOnly]="isReadOnly()" />
                  </ion-col>
                }

                @if(isDeathDateVisible()) {
                  <ion-col size="12" size-md="6">
                    <bk-date-input name="dateOfDeath" [storeDate]="dateOfDeath()" (storeDateChange)="onFieldChange('dateOfDeath', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
              </ion-row>
            }

            <ion-row>
              @if(isVisibleToUser(priv().showGender)) {
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="genders()!" [selectedItemName]="gender()" (selectedItemNameChange)="onFieldChange('gender', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                </ion-col>
              }
      
              @if(isVisibleToUser(priv().showTaxId)) {
                <ion-col size="12" size-md="6">
                  <bk-text-input name="ssnId" [value]="ssnId()" (valueChange)="onFieldChange('ssnId', $event)" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [copyable]=true [readOnly]="isReadOnly()" />                                        
                </ion-col>
              }
              @if(isVisibleToUser(priv().showBexioId)) {
                <ion-col size="12" size-md="6">
                  <bk-text-input name="bexioId" [value]="bexioId()" (valueChange)="onFieldChange('bexioId', $event)" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" />                                        
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(isTagsVisible()) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }
      
      @if(isNotesVisible()) {
        <bk-notes [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
  `
})
export class PersonFormComponent {  
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
