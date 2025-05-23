import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms, vestFormsViewProviders } from 'ngx-vest-forms';

import { ErrorNoteComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared/ui';
import { UserModel } from '@bk2/shared/models';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';
import { ResourceFormModel, resourceFormValidations } from '@bk2/resource/util';

@Component({
  selector: 'bk-real-estate',
  imports: [
    vestForms,
    IonRow, IonCol, IonCard, IonCardTitle, IonCardHeader, IonCardContent, IonGrid,
    TextInputComponent, NumberInputComponent, ErrorNoteComponent
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
        <ion-card>
          <ion-card-header>
            <ion-card-title>Angaben zur Immobilie</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="name" [value]="name()" [maxLength]=30 [readOnly]="readOnly()" />
                  <bk-error-note [errors]="nameErrors()" />                                                                                                                                                                                          
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="currentValue" [value]="currentValue()" [maxLength]=10 [showHelper]=true [readOnly]="readOnly()" />
                  <bk-error-note [errors]="currentValueErrors()" />                                                                                                                                                                                                                                  
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
  `
})
export class RealEstateComponent {
  public vm = model.required<ResourceFormModel>();
  public currentUser = input.required<UserModel | undefined>();

  public readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  
  private readonly validationResult = computed(() => resourceFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected currentValueErrors = computed(() => this.validationResult().getErrors('currentValue'));

  protected name = linkedSignal(() => this.vm()?.name ?? '');
  protected currentValue = linkedSignal(() => this.vm()?.currentValue ?? 0);

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected onValueChange(value: ResourceFormModel): void {
    this.vm.update((_vm) => ({ ..._vm, ...value }));
  }
}


