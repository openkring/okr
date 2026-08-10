import { Component, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { VersionCheckService } from '@okr/shared-util-angular';

import { TRIP_I18N_KEYS, TripI18n } from '@okr/trip-util';

/**
 * Explains the Logbuch to the user: what to enter before a trip, why it matters, and what
 * happens after — triggered by the info icon in the list header.
 *
 * The three illustrations are inline SVG on purpose: they are decorative, three of them, and
 * bound to this one explainer. Going through the icon repository would mean three DB entries
 * and three network round trips for artwork nothing else uses. They inherit `currentColor`,
 * so they follow the theme like everything else here.
 */
@Component({
  selector: 'okr-trip-info-modal',
  standalone: true,
  imports: [
    Header,
    IonContent,
  ],
  styles: [`
    .sheet {
      max-width: 620px;
      margin: 0 auto;
      padding: 24px 24px 0;
    }
    .intro {
      margin: 0 0 22px;
      font-size: 16px;
      line-height: 1.5;
    }
    .topics { display: grid; gap: 18px; }
    .topic {
      display: grid;
      grid-template-columns: 64px 1fr;
      gap: 16px;
      align-items: start;
    }
    .illustration {
      height: 64px;
      border-radius: 8px;
      background: var(--ion-color-light);
      color: var(--ion-color-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .eyebrow {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--ion-color-medium);
      margin-bottom: 5px;
    }
    .topic p { margin: 0; font-size: 15px; line-height: 1.5; }

    .note {
      margin: 20px 0 0;
      padding: 16px 18px;
      background: var(--ion-color-light);
      border-radius: 8px;
    }
    .note p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ion-color-medium-shade); }

    .version { padding: 14px 0 18px; font-size: 13px; color: var(--ion-color-medium); }

    /* the phone gets a single column: a 64px gutter next to wrapped text wastes half the width */
    @media (width <= 480px) {
      .sheet { padding-inline: 16px; }
      .topic { grid-template-columns: 1fr; gap: 8px; }
      .illustration { width: 64px; }
    }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.list_title() }" [isModal]="true" />
    <ion-content>
      <div class="sheet">
        <p class="intro">{{ i18n.info_intro() }}</p>

        <div class="topics">
          <div class="topic">
            <div class="illustration">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M5 30 C 14 30, 12 12, 22 12 S 32 20, 35 10" stroke-dasharray="3 3" />
                <circle cx="5" cy="30" r="3" fill="currentColor" stroke="none" />
                <circle cx="35" cy="10" r="3" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_before_title() }}</div>
              <p>{{ i18n.info_before_text() }}</p>
            </div>
          </div>

          <div class="topic">
            <div class="illustration">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <circle cx="20" cy="20" r="4" fill="currentColor" stroke="none" />
                <circle cx="20" cy="20" r="9" />
                <circle cx="20" cy="20" r="15" stroke-dasharray="3 4" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_why_title() }}</div>
              <p>{{ i18n.info_why_text() }}</p>
            </div>
          </div>

          <div class="topic">
            <div class="illustration">
              <!-- a clock: reserve close to the moment you row -->
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <circle cx="20" cy="20" r="13" />
                <path d="M20 12 V20 L26 23" stroke-linecap="round" />
                <circle cx="20" cy="20" r="1.6" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_reservation_title() }}</div>
              <p>{{ i18n.info_reservation_text() }}</p>
            </div>
          </div>

          <div class="topic">
            <div class="illustration">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <line x1="6" y1="32" x2="34" y2="32" />
                <rect x="9" y="22" width="6" height="10" fill="currentColor" stroke="none" />
                <rect x="18" y="16" width="6" height="16" fill="currentColor" stroke="none" opacity=".6" />
                <rect x="27" y="9" width="6" height="23" fill="currentColor" stroke="none" opacity=".3" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_after_title() }}</div>
              <p>{{ i18n.info_after_text() }}</p>
            </div>
          </div>
        </div>

        <div class="note">
          <p>{{ i18n.warning_note() }}</p>
        </div>

        <div class="version">Version {{ appVersion }}</div>
      </div>
    </ion-content>
  `,
})
export class TripInfoModal {
  protected readonly i18n = inject(I18nService).translateAll(TRIP_I18N_KEYS) as TripI18n;
  protected readonly appVersion = inject(VersionCheckService).getCurrentVersion();
}
