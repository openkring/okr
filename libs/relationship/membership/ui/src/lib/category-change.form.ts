import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { CategorySelectComponent, DateInputComponent } from '@bk2/shared-ui';

import { CategoryChangeFormModel, categoryChangeFormModelShape, categoryChangeFormValidations, MembershipFormModel } from '@bk2/relationship-membership-util';


@Component({
  selector: 'bk-category-change-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe, SvgIconPipe,
    DateInputComponent, CategorySelectComponent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonIcon
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
  
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
                <bk-cat-select [category]="membershipCategory()" [selectedItemName]="oldCategory()" popoverId="mcat-change1" [readOnly]="true" [showHelper]=true labelName="labelOld" />
              </ion-item>
            </ion-col>
            <ion-col size="2">
              <ion-item lines="none">
                <ion-icon slot="start" color="primary" src="{{'arrow-forward' | svgIcon }}" />
              </ion-item>
            </ion-col>
            <ion-col size="5">
              <ion-item lines="none">
                <bk-cat-select [category]="membershipCategory()" [selectedItemName]="oldCategory()" popoverId="mcat-change2" labelName="labelNew" (changed)="onChange('membershipCategoryNew', $event)" />
              </ion-item>
            </ion-col>
            <ion-col size="12"> 
              <bk-date-input name="dateOfChange" [storeDate]="dateOfChange()" [showHelper]=true (changed)="onChange('dateOfChange', $event)" />
            </ion-col>      
          </ion-row>
      </ion-grid>
    </form>
  `
})
export class CategoryChangeFormComponent {
  public vm = model.required<CategoryChangeFormModel>();
  public membershipCategory = input.required<CategoryListModel>();

  protected name = computed(() => this.vm().memberName ?? ''); 
  protected orgName = computed(() => this.vm().orgName ?? '');
  protected oldCategory = computed(() => this.vm().membershipCategoryOld ?? '');
  protected newCategory = computed(() => this.vm().membershipCategoryOld ?? '');
  protected dateOfChange = computed(() => this.vm().dateOfChange ?? '');

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = categoryChangeFormValidations;
  protected readonly shape = categoryChangeFormModelShape;
  private readonly validationResult = computed(() => categoryChangeFormValidations(this.vm()));

  protected onValueChange(value: MembershipFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}
