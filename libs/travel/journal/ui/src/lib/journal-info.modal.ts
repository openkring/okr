import { Component, inject } from '@angular/core';
import { IonContent } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { JOURNAL_I18N_KEYS, JournalI18n } from '@okr/travel-journal-util';

/**
 * Explains the travel journal's way of working (spec 1.113 plan 4): local first, photos through the
 * Photos app, the departure checklist, what goes over the Internet, the photo modes and the direct
 * link between the two iPads. Read-only — nothing to save.
 */
@Component({
  selector: 'okr-journal-info-modal',
  standalone: true,
  imports: [Header, IonContent],
  styles: [`
    .info { max-width: 680px; margin: 0 auto; line-height: 1.45; }
    h3 { margin: 20px 0 6px; font-size: 1.05rem; }
    p, li { margin: 0 0 6px; }
    ol, ul { padding-left: 20px; margin: 0; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.info_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <div class="info">
        <h3>{{ i18n.info_offline_h() }}</h3>
        <p>{{ i18n.info_offline() }}</p>

        <h3>{{ i18n.info_photos_h() }}</h3>
        <p>{{ i18n.info_photos() }}</p>

        <h3>{{ i18n.info_before_h() }}</h3>
        <ol>
          <li>{{ i18n.info_before_1() }}</li>
          <li>{{ i18n.info_before_2() }}</li>
          <li>{{ i18n.info_before_3() }}</li>
          <li>{{ i18n.info_before_4() }}</li>
          <li>{{ i18n.info_before_5() }}</li>
        </ol>

        <h3>{{ i18n.info_internet_h() }}</h3>
        <p>{{ i18n.info_internet() }}</p>

        <h3>{{ i18n.info_modes_h() }}</h3>
        <ul>
          <li>{{ i18n.info_mode_all() }}</li>
          <li>{{ i18n.info_mode_upload() }}</li>
          <li>{{ i18n.info_mode_paused() }}</li>
        </ul>

        <h3>{{ i18n.info_local_h() }}</h3>
        <p>{{ i18n.info_local() }}</p>

        <h3>{{ i18n.info_home_h() }}</h3>
        <p>{{ i18n.info_home() }}</p>
      </div>
    </ion-content>
  `,
})
export class JournalInfoModal {
  // direct inject, no store: the journal pages open this modal
  protected readonly i18n = inject(I18nService).translateAll(JOURNAL_I18N_KEYS) as JournalI18n;
}
