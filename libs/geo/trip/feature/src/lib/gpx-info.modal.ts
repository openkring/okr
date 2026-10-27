import { Component, inject } from '@angular/core';
import { IonContent } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';

import { TRIP_I18N_KEYS, TripI18n } from '@okr/trip-util';

/**
 * Explains the GPX file a crew member downloads from the Logbuch view (spec 1.123 §5.2): what the format is, where
 * the file lands on each device, and which apps can open it. Read-only: header with close button and text only.
 */
@Component({
  selector: 'okr-gpx-info-modal',
  standalone: true,
  imports: [Header, IonContent],
  styles: [`
    .sheet { max-width: 620px; margin: 0 auto; padding: 24px 24px 18px; }
    h2 { font-size: 17px; font-weight: 700; margin: 0 0 6px; }
    h2:not(:first-child) { margin-top: 22px; }
    p, li { font-size: 15px; line-height: 1.5; }
    p { margin: 0; }
    ul { margin: 0; padding-inline-start: 20px; display: grid; gap: 6px; }
    @media (width <= 480px) { .sheet { padding-inline: 16px; } }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.track_info_title() }" [isModal]="true" />
    <ion-content>
      <div class="sheet">
        <h2>{{ i18n.track_info_title() }}</h2>
        <p>{{ i18n.track_info_what() }}</p>

        <h2>{{ i18n.track_info_where_title() }}</h2>
        <ul>
          <li>{{ i18n.track_info_where_ios() }}</li>
          <li>{{ i18n.track_info_where_android() }}</li>
          <li>{{ i18n.track_info_where_computer() }}</li>
        </ul>

        <h2>{{ i18n.track_info_use_title() }}</h2>
        <p>{{ i18n.track_info_use_text() }}</p>
      </div>
    </ion-content>
  `,
})
export class GpxInfoModal {
  protected readonly i18n = inject(I18nService).translateAll(TRIP_I18N_KEYS) as TripI18n;
}
