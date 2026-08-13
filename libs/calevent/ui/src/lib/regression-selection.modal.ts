import { Component, inject, input, signal } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonRadio, IonRadioGroup, ModalController } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';

@Component({
  selector: 'okr-regression-selection-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonRadioGroup, IonRadio, IonLabel, IonItem, IonList
  ],
  template: `
    <okr-header [i18n]="{ title: i18n().title }" [showOkButton]="true" (okClicked)="save()" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <ion-item>
        <ion-label class="ion-text-wrap">{{ i18n().intro }}</ion-label>
      </ion-item>
      <ion-list>
        <ion-radio-group [value]="selectedOption()" (ionChange)="selectedOption.set($event.detail.value)">
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{ i18n().current }}
            </ion-label>
            <ion-radio slot="start" value="current" />
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{ i18n().future }}
            </ion-label>
            <ion-radio slot="start" value="future" />
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{ i18n().all }}
            </ion-label>
            <ion-radio slot="start" value="all" />
          </ion-item>
        </ion-radio-group>
      </ion-list>
    </ion-content>
  `
})
export class RegressionSelectionModal {
  private modalController = inject(ModalController);

  // inputs
  public readonly i18n = input.required<{ title: string, intro: string, current: string, future: string, all: string }>();

  // state
  protected selectedOption = signal('current');

  
  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.selectedOption(), 'confirm');
  }
}
