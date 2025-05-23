import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms, vestFormsViewProviders } from 'ngx-vest-forms';

import { ColorComponent, ErrorNoteComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { UserModel } from '@bk2/shared/models';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';
import { ResourceFormModel, resourceFormValidations } from '@bk2/resource/util';

@Component({
  selector: 'bk-boat',
  imports: [
    vestForms,
    IonRow, IonCol, IonCard, IonCardTitle, IonCardHeader, IonCardContent, IonGrid,
    TextInputComponent, NumberInputComponent, ColorComponent, ErrorNoteComponent
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
        <ion-card>
          <ion-card-header>
            <ion-card-title>Angaben zum Boot</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="name" [value]="name()" [maxLength]=20 [readOnly]="readOnly()" />                                        
                  <bk-error-note [errors]="nameErrors()" />                                                                                                                                                             
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="load" [value]="load()" [maxLength]=20 [readOnly]="readOnly()" />                                        
                  <bk-error-note [errors]="loadErrors()" />                                                                                                                                                             
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="currentValue" [value]="currentValue()" [maxLength]=10 [showHelper]=true [readOnly]="readOnly()" />                                        
                  <bk-error-note [errors]="currentValueErrors()" />                                                                                                                                                             
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-color [hexColor]="hexColor()" />
                  <bk-error-note [errors]="hexColorErrors()" />                                                                                                                                                             
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
  `
})
export class BoatComponent {
  public vm = model.required<ResourceFormModel>();
  public currentUser = input.required<UserModel | undefined>();

  public readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  
  private readonly validationResult = computed(() => resourceFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected loadErrors = computed(() => this.validationResult().getErrors('load'));
  protected currentValueErrors = computed(() => this.validationResult().getErrors('currentValue'));
  protected hexColorErrors = computed(() => this.validationResult().getErrors('hexColor'));

  protected name = linkedSignal(() => this.vm()?.name ?? '');
  protected load = linkedSignal(() => this.vm().load ?? '');
  protected currentValue = linkedSignal(() => this.vm()?.currentValue ?? 0);
  protected hexColor = linkedSignal(() => this.vm()?.hexColor ?? '');

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected onValueChange(value: ResourceFormModel): void {
    this.vm.update((_vm) => ({ ..._vm, ...value }));
  }
}


