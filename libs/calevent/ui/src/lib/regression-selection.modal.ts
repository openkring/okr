import { Component, inject, input, signal } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonRadio, IonRadioGroup, ModalController } from '@ionic/angular/standalone';

import { Header } from '@bk2/shared-ui';

@Component({
  selector: 'bk-regression-selection-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonRadioGroup, IonRadio, IonLabel, IonItem, IonList
  ],
  template: `
    <bk-header [i18n]="{ title: title() }" [showOkButton]="true" (okClicked)="save()" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <ion-item>
        <ion-label>{{'@calevent.operation.seriesupdate.intro' }}</ion-label>
      </ion-item>
      <ion-list>
        <ion-radio-group [value]="selectedOption()" (ionChange)="selectedOption.set($event.detail.value)">
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{'@calevent.operation.seriesupdate.current' }}
            </ion-label>
            <ion-radio slot="start" value="current" />
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{'@calevent.operation.seriesupdate.future' }}
            </ion-label>
            <ion-radio slot="start" value="future" />
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap">
              {{'@calevent.operation.seriesupdate.all' }}
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
  public title = input('@calevent.operation.seriesupdate.label');

  // state
  protected selectedOption = signal('current');

  
  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.selectedOption(), 'confirm');
  }
}
