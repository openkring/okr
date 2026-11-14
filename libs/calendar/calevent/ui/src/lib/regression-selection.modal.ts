import { Component, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

/**
 * Asks which part of a series a change applies to. A tap on an option chooses it and closes the
 * modal (role 'confirm'); the header's close button dismisses without a choice.
 */
@Component({
  selector: 'okr-regression-selection-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonLabel, IonItem, IonList
  ],
  template: `
    <okr-header [i18n]="{ title: i18n().title }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">{{ i18n().intro }}</ion-label>
      </ion-item>
      <ion-list>
        @for (option of options; track option) {
          <ion-item [button]="true" [detail]="true" (click)="select(option)">
            <ion-label class="ion-text-wrap">{{ i18n()[option] }}</ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `
})
export class RegressionSelectionModal {
  private modalController = inject(ModalController);

  // inputs
  public readonly i18n = input.required<{ title: string, intro: string, current: string, future: string, all: string }>();

  protected readonly options = ['current', 'future', 'all'] as const;

  /******************************* actions *************************************** */
  public async select(option: 'current' | 'future' | 'all'): Promise<void> {
    await dismissOverlay(this.modalController, option, 'confirm');
  }
}
