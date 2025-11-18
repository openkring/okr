import { Component, computed, input, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms, vestFormsViewProviders } from 'ngx-vest-forms';

import { ErrorNoteComponent, TextInputComponent } from '@bk2/shared-ui';

import { ResourceFormModel, resourceFormValidations } from '@bk2/resource-util';

@Component({
  selector: 'bk-key',
  standalone: true,
  imports: [
    vestForms,
    IonRow, IonCol, IonCard, IonCardTitle, IonCardHeader, IonCardContent, IonGrid,
    TextInputComponent, ErrorNoteComponent
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
        <ion-card>
          <ion-card-header>
            <ion-card-title>Angaben zum Schlüssel</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                <bk-text-input name="keyNr" [value]="name()" [maxLength]=20 [readOnly]="readOnly()" />
                <bk-error-note [errors]="keyNrErrors()" />                                                                                                                                                                                                    
                </ion-col>        
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
  `
})
export class KeyComponent {
  public vm = model.required<ResourceFormModel>();
  public readOnly = input(true);

  protected name = computed(() => this.vm().name ?? '');

  private readonly validationResult = computed(() => resourceFormValidations(this.vm()));
  protected keyNrErrors = computed(() => this.validationResult().getErrors('keyNr'));
}


