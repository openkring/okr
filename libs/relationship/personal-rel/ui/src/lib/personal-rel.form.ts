import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { Router } from '@angular/router';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, PersonalRelModel, RoleName, UserModel } from '@bk2/shared-models';
import { FullNamePipe } from '@bk2/shared-pipes';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERSONAL_REL, DEFAULT_TAGS } from '@bk2/shared-constants';

import { AvatarPipe } from '@bk2/avatar-ui';
import { personalRelValidations } from '@bk2/relationship-personal-rel-util';

@Component({
  selector: 'bk-personal-rel-form',
  standalone: true,
  imports: [
    vestForms,
    AvatarPipe, AsyncPipe, FullNamePipe, TranslatePipe,
    DateInputComponent, ChipsComponent, NotesInputComponent, CategorySelectComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonAvatar, IonImg, IonLabel, IonButton,
    TextInputComponent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form scVestForm
      [formValue]="formData()"
      (formValueChange)="onFormChange($event)"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
    >
    
      <ion-card>
        <ion-card-header>
          <ion-card-title>Personen</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
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
                  <ion-button slot="start" fill="clear" (click)="selectPerson.emit(true)">{{ '@general.operation.select.label' | translate | async }}</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6"> 
                <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>
              @if(type() === 'custom') {
                <ion-col size="12" size-md="6">
                    <bk-text-input name="label" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="isReadOnly()" />
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
                <ion-button slot="start" fill="clear" (click)="selectPerson.emit(false)">{{ '@general.operation.select.label' | translate | async }}</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>        
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Gültigkeit</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input name="validFrom" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input name="validTo" [storeDate]="validTo()" (storeDateChange)="onFieldChange('validTo', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) {
        <bk-notes name="notes" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
  `
})
export class PersonalRelFormComponent {
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);

  // inputs
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

  // validation and errors
  protected readonly suite = personalRelValidations;
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
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES
);

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
  
  protected onFormChange(value: PersonalRelModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormModel('PersonalRelForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('PersonalRelForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async showPerson(personKey: string): Promise<void> {
    if (this.modalController) this.modalController.dismiss(null, 'cancel');
    await this.router.navigateByUrl(`/person/${personKey}`);
  }
}
