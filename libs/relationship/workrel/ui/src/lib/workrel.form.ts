import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { AsyncPipe } from '@angular/common';

import { CategoryListModel, RoleName, UserModel, WorkrelModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_ORG_TYPE, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_WORKREL_STATE, DEFAULT_WORKREL_TYPE } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { FullNamePipe } from '@bk2/shared-pipes';

import { AvatarPipe } from '@bk2/avatar-ui';

import { workrelValidations } from '@bk2/relationship-workrel-util';

@Component({
  selector: 'bk-workrel-form',
  standalone: true,
  imports: [
    vestForms,
    AvatarPipe, AsyncPipe, FullNamePipe, TranslatePipe,
    DateInputComponent, ChipsComponent, NotesInputComponent, CategorySelectComponent, NumberInputComponent,
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
          <ion-card-title>Beschäftigung</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                <ion-item lines="none">
                  <ion-avatar slot="start">
                    <ion-img src="{{ 'person.' + subjectKey() | avatar | async }}" alt="Avatar of person" />
                  </ion-avatar>
                  <ion-label>{{ subjectName1() | fullName:subjectName2() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="3">
                <ion-item lines="none">
                  <ion-button slot="start" fill="clear" (click)="selectPerson.emit()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
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
                <ion-item lines="none">
                  <ion-avatar slot="start">
                  <ion-img src="{{ 'org.' + objectKey() | avatar | async }}" alt="Logo of organization" />
                  </ion-avatar>
                  <ion-label>{{ objectName() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="3">
                <ion-item lines="none">
                <ion-button slot="start" fill="clear" (click)="selectOrg.emit()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>        
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Gültigkeit und Status</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-date-input name="validFrom" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input name="validTo" [storeDate]="validTo()" (storeDateChange)="onFieldChange('validTo', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-number-input name="order" [value]="order()" (valueChange)="onFieldChange('order', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="states()!" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Kompensation</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
              <bk-number-input name="price" [value]="price()" (valueChange)="onFieldChange('price', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
              <bk-text-input name="currency" [value]="currency()" (valueChange)="onFieldChange('currency', $event)" [maxLength]="3" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="periodicities()!" [selectedItemName]="periodicity()" (selectedItemNameChange)="onFieldChange('periodicity', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) {
        <bk-notes [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
  `
})
export class WorkrelFormComponent {
  // inputs
  public formData = model.required<WorkrelModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly periodicities = input.required<CategoryListModel>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public selectPerson = output<void>();
  public selectOrg = output<void>();

  // validation and errors
  protected readonly suite = workrelValidations;
  private readonly validationResult = computed(() => workrelValidations(this.formData()));

  // fields
  protected subjectKey = computed(() => this.formData().subjectKey ?? DEFAULT_KEY);
  protected subjectName1 = computed(() => this.formData().subjectName1 ?? DEFAULT_NAME);
  protected subjectName2 = computed(() => this.formData().subjectName2 ?? DEFAULT_NAME);
  protected subjectType = computed(() => this.formData().subjectType ?? DEFAULT_GENDER);

  protected objectKey = computed(() => this.formData().objectKey ?? DEFAULT_KEY);
  protected objectName = computed(() => this.formData().objectName ?? DEFAULT_NAME);
  protected objectType = computed(() => this.formData().objectType ?? DEFAULT_ORG_TYPE);

  // linked signals for two-way binding
  protected type = linkedSignal(() => this.formData().type ?? DEFAULT_WORKREL_TYPE);
  protected label = linkedSignal(() => this.formData().label ?? DEFAULT_LABEL);
  protected validFrom = linkedSignal(() => this.formData().validFrom ?? DEFAULT_DATE);
  protected validTo = linkedSignal(() => this.formData().validTo ?? DEFAULT_DATE);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected price = linkedSignal(() => this.formData().price ?? DEFAULT_PRICE);
  protected currency = linkedSignal(() => this.formData().currency ?? DEFAULT_CURRENCY);
  protected periodicity = linkedSignal(() => this.formData().periodicity ?? 'monthly');
  protected order = linkedSignal(() => this.formData().order ?? DEFAULT_ORDER);
  protected state = linkedSignal(() => this.formData().state ?? DEFAULT_WORKREL_STATE);

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: WorkrelModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormModel('WorkrelForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('WorkrelForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
