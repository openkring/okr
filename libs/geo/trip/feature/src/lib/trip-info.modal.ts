import { Component, inject } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { VersionCheckService } from '@okr/shared-util-angular';

import { TRIP_I18N_KEYS, TripI18n } from '@okr/trip-util';

/**
 * Shows the trip-list description text (general description + warning note) in a modal,
 * triggered by the info icon in the list header.
 */
@Component({
  selector: 'okr-trip-info-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonList, IonItem, IonLabel, IonNote,
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.list_title() }" [isModal]="true" />
    <ion-content>
      <ion-list lines="none">
        <ion-item>
          <ion-label class="ion-text-wrap">{{ i18n.desc() }}</ion-label>
        </ion-item>
        <ion-item color="light">
          <ion-label class="ion-text-wrap">{{ i18n.warning_note() }}</ion-label>
        </ion-item>
      </ion-list>
      <ion-note class="ion-padding" color="medium">Version {{ appVersion }}</ion-note>
    </ion-content>
  `,
})
export class TripInfoModal {
  protected readonly i18n = inject(I18nService).translateAll(TRIP_I18N_KEYS) as TripI18n;
  protected readonly appVersion = inject(VersionCheckService).getCurrentVersion();
}
