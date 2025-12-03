import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { Router } from '@angular/router';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AvatarPipe } from '@bk2/avatar-ui';
import { PERSONAL_REL_FORM_SHAPE, PersonalRelFormModel, personalRelFormValidations } from '@bk2/relationship-personal-rel-util';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { FullNamePipe } from '@bk2/shared-pipes';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERSONAL_REL, DEFAULT_TAGS } from '@bk2/shared-constants';

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
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">
  
    <ion-card>
      <ion-card-header>
        <ion-card-title>Personen</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="9">
              <ion-item lines="none" (click)="showPerson(subjectKey())">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'person.' + subjectKey() | avatar | async }}" alt="Avatar of first person" />
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
              <bk-cat-select [category]="types()!" selectedItemName="type()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('type', $event)" />
            </ion-col>
            @if(type() === 'custom') {
              <ion-col size="12" size-md="6">
                  <bk-text-input name="label" [value]="label()" [readOnly]="isReadOnly()" (changed)="onFieldChange('label', $event)" />
              </ion-col>
            }
          </ion-row>
          <ion-row>
            <ion-col size="9">
              <ion-item lines="none" (click)="showPerson(objectKey())">
                <ion-avatar slot="start">
                <ion-img src="{{ 'person.' + objectKey() | avatar | async }}" alt="Avatar of second person" />
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
              <bk-date-input name="validFrom" [storeDate]="validFrom()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('validFrom', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="validTo" [storeDate]="validTo()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('validTo', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
    }

    @if(hasRole('admin')) {
      <bk-notes [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
    }
  </form>
  `
})
export class PersonalRelFormComponent {
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);


  // inputs
  public formData = model.required<PersonalRelFormModel>();
  public currentUser = input<UserModel | undefined>();
  public types = input.required<CategoryListModel>();
  public allTags = input.required<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public selectPerson = output<boolean>();

  // validation and errors
  protected readonly suite = personalRelFormValidations;
  protected readonly shape = PERSONAL_REL_FORM_SHAPE;
  private readonly validationResult = computed(() => personalRelFormValidations(this.formData()));

  // fields
  protected subjectKey = computed(() => this.formData().subjectKey ?? DEFAULT_KEY);
  protected subjectFirstName = computed(() => this.formData().subjectFirstName ?? DEFAULT_NAME);
  protected subjectLastName = computed(() => this.formData().subjectLastName ?? DEFAULT_NAME);
  protected subjectGender = computed(() => this.formData().subjectGender ?? DEFAULT_GENDER);

  protected objectKey = computed(() => this.formData().objectKey ?? DEFAULT_KEY);
  protected objectFirstName = computed(() => this.formData().objectFirstName ?? DEFAULT_NAME);
  protected objectLastName = computed(() => this.formData().objectLastName ?? DEFAULT_NAME);
  protected objectGender = computed(() => this.formData().objectGender ?? DEFAULT_GENDER);

  protected type = computed(() => this.formData().type ?? DEFAULT_PERSONAL_REL);
  protected label = computed(() => this.formData().label ?? DEFAULT_LABEL);
  protected validFrom = computed(() => this.formData().validFrom ?? DEFAULT_DATE);
  protected validTo = computed(() => this.formData().validTo ?? DEFAULT_DATE);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES
);

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: PersonalRelFormModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormErrors('PersonalRelForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('PersonalRelForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async showPerson(personKey: string): Promise<void> {
    if (this.modalController) this.modalController.dismiss(null, 'cancel');
    await this.router.navigateByUrl(`/person/${personKey}`);
  }
}
