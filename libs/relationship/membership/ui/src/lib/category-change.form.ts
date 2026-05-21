import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { CategorySelect, DateInput, DateInputI18n } from '@bk2/shared-ui';
import { DEFAULT_DATE, DEFAULT_NAME } from '@bk2/shared-constants';
import { coerceBoolean, debugFormErrors, debugFormModel } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import {CategoryChangeFormModel, categoryChangeFormValidations } from '@bk2/relationship-membership-util';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { PFX } from './scope';

export interface CategoryChangeFormI18n {
  helper: string;
  helperDate: string;
}

@Component({
  selector: 'bk-category-change-form',
  standalone: true,
  imports: [
    vestForms,
    SvgIconPipe,
    DateInput, CategorySelect,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonIcon, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
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
                <ion-col size="4">
                  <ion-item lines="none">
                    <bk-cat-select [category]="membershipCategory()" [selectedItemName]="oldCategory()" [readOnly]="true" labelName="labelOld" />
                  </ion-item>
                </ion-col>
                <ion-col size="3" class="ion-align-self-center ion-text-center">
                    <ion-icon src="{{ 'arrow-forward' | svgIcon }}"></ion-icon>
                </ion-col>
                <ion-col size="5">
                  <ion-item lines="none">
                    <bk-cat-select [category]="membershipCategory()" [selectedItemName]="newCategory()" (selectedItemNameChange)="onFieldChange('membershipCategoryNew', $event)" labelName="labelNew" [readOnly]="isReadOnly()" />
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().helper }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-date-input [i18n]="dateOfChangeI18n()" [storeDate]="dateOfChange()" (storeDateChange)="onFieldChange('dateOfChange', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().helperDate }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class CategoryChangeForm {
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    dateOfChange_label:       PFX + 'dateOfChange.label',
    dateOfChange_placeholder: PFX + 'dateOfChange.placeholder',
    dateOfChange_helper:      PFX + 'dateOfChange.helper',
  });
  protected dateOfChangeI18n = computed(() => ({ name: 'dateOfChange', label: this.fieldI18n.dateOfChange_label(), placeholder: this.fieldI18n.dateOfChange_placeholder(), helper: this.fieldI18n.dateOfChange_helper() } as DateInputI18n));

  // inputs
  public readonly i18n = input<CategoryChangeFormI18n>({ helper: '', helperDate: '' });
  public formData = model.required<CategoryChangeFormModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public membershipCategory = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = categoryChangeFormValidations;
  private readonly validationResult = computed(() => categoryChangeFormValidations(this.formData()));

  // fields
  protected name = computed(() => this.formData().memberName ?? DEFAULT_NAME); 
  protected orgName = computed(() => this.formData().orgName ?? DEFAULT_NAME);
  protected oldCategory = computed(() => this.formData().membershipCategoryOld ?? '');
  protected newCategory = linkedSignal(() => this.formData().membershipCategoryNew ?? '');
  protected dateOfChange = linkedSignal(() => this.formData().dateOfChange ?? DEFAULT_DATE);

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: CategoryChangeFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('CategoryChangeForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('CategoryChangeForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }
}
