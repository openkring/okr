import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { CategorySelectComponent, DateInputComponent } from '@bk2/shared-ui';

import { CATEGORY_CHANGE_FORM_SHAPE, CategoryChangeFormModel, categoryChangeFormValidations, MembershipFormModel } from '@bk2/relationship-membership-util';
import { DEFAULT_DATE, DEFAULT_NAME } from '@bk2/shared-constants';
import { coerceBoolean, debugFormErrors } from '@bk2/shared-util-core';


@Component({
  selector: 'bk-category-change-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe, SvgIconPipe,
    DateInputComponent, CategorySelectComponent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonIcon, IonCard, IonCardContent
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
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>{{ '@membership.changeDesc' | translate | async }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="5">
                  <ion-item lines="none">
                    <bk-cat-select [category]="membershipCategory()" [selectedItemName]="oldCategory()" [readOnly]="true" [showHelper]=true labelName="labelOld" />
                  </ion-item>
                </ion-col>
                <ion-col size="2">
                  <ion-item lines="none">
                    <ion-icon slot="start" color="primary" src="{{'arrow-forward' | svgIcon }}" />
                  </ion-item>
                </ion-col>
                <ion-col size="5">
                  <ion-item lines="none">
                    <bk-cat-select [category]="membershipCategory()" [selectedItemName]="oldCategory()" labelName="labelNew" [readOnly]="isReadOnly()" (changed)="onFieldChange('membershipCategoryNew', $event)" />
                  </ion-item>
                </ion-col>
                <ion-col size="12"> 
                  <bk-date-input name="dateOfChange" [storeDate]="dateOfChange()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfChange', $event)" />
                </ion-col>      
              </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class CategoryChangeFormComponent {
  // inputs
  public formData = model.required<CategoryChangeFormModel>();
  public currentUser = input<UserModel | undefined>();
  public membershipCategory = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = categoryChangeFormValidations;
  protected readonly shape = CATEGORY_CHANGE_FORM_SHAPE;
  private readonly validationResult = computed(() => categoryChangeFormValidations(this.formData()));

  // fields
  protected name = computed(() => this.formData().memberName ?? DEFAULT_NAME); 
  protected orgName = computed(() => this.formData().orgName ?? DEFAULT_NAME);
  protected oldCategory = computed(() => this.formData().membershipCategoryOld ?? '');
  protected newCategory = computed(() => this.formData().membershipCategoryOld ?? '');
  protected dateOfChange = computed(() => this.formData().dateOfChange ?? DEFAULT_DATE);


  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: CategoryChangeFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('CategoryChangeForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected onFieldChange(fieldName: string, $event: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('CategoryChangeForm.onFieldChange: ', this.validationResult().getErrors(), this.currentUser());
  }
}
