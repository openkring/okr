import { Component, computed, effect, input, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { AsyncPipe } from '@angular/common';

import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_ORG_TYPE, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_WORKREL_STATE, DEFAULT_WORKREL_TYPE } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { FullNamePipe } from '@bk2/shared-pipes';

import { AvatarPipe } from '@bk2/avatar-ui';

import { WORKREL_FORM_SHAPE, WorkrelFormModel, workrelFormValidations } from '@bk2/relationship-workrel-util';

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
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">
  
    <ion-card>
      <ion-card-header>
        <ion-card-title>Beschäftigung</ion-card-title>
      </ion-card-header>
      <ion-card-content>
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
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-date-input name="validFrom" [storeDate]="validFrom()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('validFrom', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-date-input name="validTo" [storeDate]="validTo()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('validTo', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-number-input name="order" [value]="order()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('order', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="states()!" selectedItemName="state()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('state', $event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Kompensation</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
            <bk-number-input name="price" [value]="price()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('price', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
            <bk-text-input name="currency" [value]="currency()" [maxLength]="3" [readOnly]="isReadOnly()" (changed)="onFieldChange('currency', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="periodicities()!" selectedItemName="periodicity()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('periodicity', $event)" />
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
export class WorkrelFormComponent {
  // inputs
  public formData = model.required<WorkrelFormModel>();
  public readonly currentUser = input<UserModel | undefined>();
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
  protected readonly suite = workrelFormValidations;
  protected readonly shape = WORKREL_FORM_SHAPE;
  private readonly validationResult = computed(() => workrelFormValidations(this.formData()));

  // fields
  protected subjectKey = computed(() => this.formData().subjectKey ?? DEFAULT_KEY);
  protected subjectName1 = computed(() => this.formData().subjectName1 ?? DEFAULT_NAME);
  protected subjectName2 = computed(() => this.formData().subjectName2 ?? DEFAULT_NAME);
  protected subjectType = computed(() => this.formData().subjectType ?? DEFAULT_GENDER);

  protected objectKey = computed(() => this.formData().objectKey ?? DEFAULT_KEY);
  protected objectName = computed(() => this.formData().objectName ?? DEFAULT_NAME);
  protected objectType = computed(() => this.formData().objectType ?? DEFAULT_ORG_TYPE);

  protected type = computed(() => this.formData().type ?? DEFAULT_WORKREL_TYPE);
  protected label = computed(() => this.formData().label ?? DEFAULT_LABEL);
  protected validFrom = computed(() => this.formData().validFrom ?? DEFAULT_DATE);
  protected validTo = computed(() => this.formData().validTo ?? DEFAULT_DATE);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);
  protected price = computed(() => this.formData().price ?? DEFAULT_PRICE);
  protected currency = computed(() => this.formData().currency ?? DEFAULT_CURRENCY);
  protected periodicity = computed(() => this.formData().periodicity ?? 'monthly');
  protected order = computed(() => this.formData().order ?? DEFAULT_ORDER);
  protected state = computed(() => this.formData().state ?? DEFAULT_WORKREL_STATE);

 constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: WorkrelFormModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormErrors('WorkrelForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('WorkrelForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
