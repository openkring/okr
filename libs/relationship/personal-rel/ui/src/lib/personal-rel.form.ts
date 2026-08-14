import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { CategoryListModel, PersonalRelModel, RoleName, UserModel } from '@okr/shared-models';
import { FullNamePipe } from '@okr/shared-pipes';
import { CategorySelect, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERSONAL_REL, DEFAULT_TAGS } from '@okr/shared-constants';

import { AvatarPipe } from '@okr/avatar-ui';
import { personalRelValidations, PersonalRelI18n } from '@okr/relationship-personal-rel-util';

@Component({
  selector: 'okr-personal-rel-form',
  standalone: true,
  imports: [
    AvatarPipe, FullNamePipe,
    DateInput, Chips, NotesInput, CategorySelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonAvatar, IonImg, IonLabel, IonButton,
    TextInput
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form novalidate>
    
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().card_persons() }}</ion-card-title>
        </ion-card-header>
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
              <ion-col size="9">
                <ion-item lines="none" (click)="showPerson(subjectKey())">
                  <ion-avatar slot="start">
                    <ion-img [src]="subjectAvatarKey() | avatar" alt="Avatar of first person" />
                  </ion-avatar>
                  <ion-label>{{ subjectFirstName() | fullName:subjectLastName() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="3">
                <ion-item lines="none">
                  <ion-button slot="start" fill="clear" (click)="selectPerson.emit(true)">{{ i18n().select() }}</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6"> 
                <okr-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>
              @if(type() === 'custom') {
                <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="9">
                <ion-item lines="none" (click)="showPerson(objectKey())">
                  <ion-avatar slot="start">
                  <ion-img [src]="objectAvatarKey() | avatar" alt="Avatar of second person" />
                  </ion-avatar>
                  <ion-label>{{ objectFirstName() | fullName:objectLastName() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="3">
                <ion-item lines="none">
                <ion-button slot="start" fill="clear" (click)="selectPerson.emit(false)">{{ i18n().select() }}</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>        
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().card_validity() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-date-input [i18n]="validFromI18n()" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-date-input [i18n]="validToI18n()" [storeDate]="validTo()" (storeDateChange)="onFieldChange('validTo', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged')) {
        <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) {
        <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
  `
})
export class PersonalRelForm {
  protected okeyI18n = computed(() => ({ name: 'okey', label: this.i18n().okey_label(), placeholder: this.i18n().okey_placeholder(), helper: this.i18n().okey_helper() } as TextInputI18n));
  protected labelI18n = computed(() => ({ name: 'label', label: this.i18n().label_label(), placeholder: this.i18n().label_placeholder(), helper: this.i18n().label_helper() } as TextInputI18n));
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected validFromI18n = computed(() => ({ name: 'validFrom', label: this.i18n().validFrom_label(), placeholder: this.i18n().validFrom_placeholder(), helper: this.i18n().validFrom_helper() } as DateInputI18n));
  protected validToI18n = computed(() => ({ name: 'validTo', label: this.i18n().validTo_label(), placeholder: this.i18n().validTo_placeholder(), helper: this.i18n().validTo_helper() } as DateInputI18n));

  // inputs
  public readonly i18n = input.required<PersonalRelI18n>();
  public formData = model.required<PersonalRelModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public types = input.required<CategoryListModel>();
  public allTags = input.required<string>();
  public tenants = input.required<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public selectPerson = output<boolean>();
  public showPersonOutput = output<string>();

  // validation and errors
  private readonly validationResult = computed(() => personalRelValidations(this.formData(), this.tenants(), this.allTags()));

  // fields
  protected subjectKey = linkedSignal(() => this.formData().subjectKey ?? DEFAULT_KEY);
  protected subjectFirstName = linkedSignal(() => this.formData().subjectFirstName ?? DEFAULT_NAME);
  protected subjectLastName = linkedSignal(() => this.formData().subjectLastName ?? DEFAULT_NAME);
  protected subjectGender = linkedSignal(() => this.formData().subjectGender ?? DEFAULT_GENDER);
  protected subjectAvatarKey = computed(() => 'person.' + this.subjectKey());
  protected objectAvatarKey = computed(() => 'person.' + this.objectKey());

  protected objectKey = linkedSignal(() => this.formData().objectKey ?? DEFAULT_KEY);
  protected objectFirstName = linkedSignal(() => this.formData().objectFirstName ?? DEFAULT_NAME);
  protected objectLastName = linkedSignal(() => this.formData().objectLastName ?? DEFAULT_NAME);
  protected objectGender = linkedSignal(() => this.formData().objectGender ?? DEFAULT_GENDER);

  protected type = linkedSignal(() => this.formData().type ?? DEFAULT_PERSONAL_REL);
  protected label = linkedSignal(() => this.formData().label ?? DEFAULT_LABEL);
  protected validFrom = linkedSignal(() => this.formData().validFrom ?? DEFAULT_DATE);
  protected validTo = linkedSignal(() => this.formData().validTo ?? DEFAULT_DATE);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected okey = computed(() => this.formData().okey ?? DEFAULT_KEY);

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected showPerson(personKey: string): void {
    this.showPersonOutput.emit(personKey);
  }
}
