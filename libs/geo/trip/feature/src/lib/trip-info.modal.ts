import { Component, inject } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { I18nService } from '@bk2/shared-i18n';
import { Header } from '@bk2/shared-ui';

import { TRIP_I18N_KEYS, TripI18n } from '@bk2/trip-util';

/**
 * Shows the trip-list description text (general description + warning note) in a modal,
 * triggered by the info icon in the list header.
 */
@Component({
  selector: 'bk-trip-info-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonList, IonItem, IonLabel,
  ],
  template: `
    <bk-header [i18n]="{ title: i18n.list_title() }" [isModal]="true" />
    <ion-content>
      <ion-list lines="none">
        <ion-item>
          <ion-label class="ion-text-wrap">{{ i18n.desc() }}</ion-label>
        </ion-item>
        <ion-item color="light">
          <ion-label class="ion-text-wrap">{{ i18n.warning_note() }}</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class TripInfoModal {
  protected readonly i18n = inject(I18nService).translateAll(TRIP_I18N_KEYS) as TripI18n;
}
