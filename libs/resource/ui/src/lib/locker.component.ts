import { Component, computed, input, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms, vestFormsViewProviders } from 'ngx-vest-forms';

import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ErrorNoteComponent, NumberInputComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { ResourceFormModel, resourceFormValidations } from '@bk2/resource-util';

@Component({
  selector: 'bk-locker',
  standalone: true,
  imports: [
    vestForms,
    IonRow, IonCol, IonCard, IonCardTitle, IonCardHeader, IonCardContent, IonGrid,
    NumberInputComponent, ErrorNoteComponent, CategorySelectComponent
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
        <ion-card>
          <ion-card-header>
            <ion-card-title>Angaben zum Garderoben-Kasten</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="lockerNr" [value]="lockerNr()" [maxLength]=3 [showHelper]=true [readOnly]="readOnly()" />
                  <bk-error-note [errors]="lockerNrErrors()" />                                                                                                                                                                                                                                
                </ion-col>
        
                <ion-col size="12" size-md="6">
                  <bk-number-input name="keyNr" [value]="keyNr()" [maxLength]=5 [readOnly]="readOnly()" />
                  <bk-error-note [errors]="keyNrErrors()" />                                                                                                                                                                                                                             
                </ion-col> 
                <ion-col size="12">
                  <bk-cat-select [category]="subTypes()!" [selectedItemName]="vm().subType" [withAll]="false" [readOnly]="readOnly()" (changed)="onChange('subType', $event)" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>    
  `
})
export class LockerComponent {
  public vm = model.required<ResourceFormModel>();
  public currentUser = input.required<UserModel | undefined>();
  public subTypes = input.required<CategoryListModel | undefined>();

  public readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  protected keyNr = computed(() => this.vm().keyNr ?? 0);
  protected lockerNr = computed(() => this.vm().lockerNr ?? 0);

  private readonly validationResult = computed(() => resourceFormValidations(this.vm()));
  protected keyNrErrors = computed(() => this.validationResult().getErrors('keyNr'));
  protected lockerNrErrors = computed(() => this.validationResult().getErrors('lockerNr'));

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected onChange(fieldName: string, $event: string): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
  }

  protected onValueChange(value: ResourceFormModel): void {
    this.vm.update((_vm) => ({ ..._vm, ...value }));
  }
}


