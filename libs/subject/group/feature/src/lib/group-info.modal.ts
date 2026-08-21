import { Component, inject } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';

import { GROUP_I18N_KEYS, GroupI18n } from '@okr/subject-group-util';
import { dismissOverlay } from '@okr/shared-util-angular';

/**
 * Explains groups to the user: what a group is, what each segment does, who administers it
 * and why creating one needs the 'privileged' role — triggered by the info icon in the
 * group list header.
 *
 * The illustrations are inline SVG on purpose (same reasoning as TripInfoModal): they are
 * decorative, bound to this one explainer, and would otherwise mean one icon-repository
 * entry plus a network round trip each. They inherit `currentColor` and follow the theme.
 */
@Component({
  selector: 'okr-group-info-modal',
  standalone: true,
  imports: [
    Header, SvgIconPipe,
    IonContent, IonButton, IonIcon,
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
      margin: 20px 0 24px;
      padding: 16px 18px;
      background: var(--ion-color-light);
      border-radius: 8px;
    }
    .note .eyebrow { color: var(--ion-color-medium-shade); }
    .note p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ion-color-medium-shade); }

    /* the phone gets a single column: a 64px gutter next to wrapped text wastes half the width */
    @media (width <= 480px) {
      .sheet { padding-inline: 16px; }
      .topic { grid-template-columns: 1fr; gap: 8px; }
      .illustration { width: 64px; }
    }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.info_title() }" [isModal]="true" />
    <ion-content>
      <div class="sheet">
        <p class="intro">{{ i18n.info_intro() }}</p>

        <div class="topics">
          <div class="topic">
            <div class="illustration">
              <!-- members: a small group of people -->
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <circle cx="16" cy="15" r="5" />
                <path d="M7 31 c0-5 4-8 9-8 s9 3 9 8" stroke-linecap="round" />
                <circle cx="28" cy="16" r="4" opacity=".5" />
                <path d="M26 24 c4 0 7 3 7 7" stroke-linecap="round" opacity=".5" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_members_title() }}</div>
              <p>{{ i18n.info_members_text() }}</p>
            </div>
          </div>

          <div class="topic">
            <div class="illustration">
              <!-- chat: two speech bubbles -->
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M6 10 h18 v12 h-11 l-7 5 v-5 h0 z" stroke-linejoin="round" />
                <path d="M18 16 h16 v10 h-3 v4 l-5 -4 h-8 z" stroke-linejoin="round" opacity=".5" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_chat_title() }}</div>
              <p>{{ i18n.info_chat_text() }}</p>
            </div>
          </div>

          <div class="topic">
            <div class="illustration">
              <!-- calendar sheet -->
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <rect x="7" y="10" width="26" height="23" rx="3" />
                <path d="M7 17 h26" />
                <path d="M14 7 v6 M26 7 v6" stroke-linecap="round" />
                <rect x="12" y="21" width="5" height="4" fill="currentColor" stroke="none" opacity=".6" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_calendar_title() }}</div>
              <p>{{ i18n.info_calendar_text() }}</p>
            </div>
          </div>

          <div class="topic">
            <div class="illustration">
              <!-- content page: a document with text lines -->
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M11 6 h13 l6 6 v22 h-19 z" stroke-linejoin="round" />
                <path d="M24 6 v6 h6" stroke-linejoin="round" />
                <path d="M15 20 h11 M15 25 h11 M15 30 h7" stroke-linecap="round" opacity=".6" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_content_title() }}</div>
              <p>{{ i18n.info_content_text() }}</p>
            </div>
          </div>

          <div class="topic">
            <div class="illustration">
              <!-- tasks: a checklist -->
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M8 13 l3 3 l5 -6" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M8 26 l3 3 l5 -6" stroke-linecap="round" stroke-linejoin="round" opacity=".5" />
                <path d="M21 14 h12 M21 27 h12" stroke-linecap="round" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_tasks_title() }}</div>
              <p>{{ i18n.info_tasks_text() }}</p>
            </div>
          </div>

          <div class="topic">
            <div class="illustration">
              <!-- files: a folder -->
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <path d="M6 12 h10 l3 4 h15 v17 h-28 z" stroke-linejoin="round" />
                <path d="M6 20 h28" opacity=".5" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_files_title() }}</div>
              <p>{{ i18n.info_files_text() }}</p>
            </div>
          </div>

          <div class="topic">
            <div class="illustration">
              <!-- group admin: a person with a star -->
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                <circle cx="18" cy="15" r="5" />
                <path d="M9 32 c0-5 4-9 9-9 s9 4 9 9" stroke-linecap="round" />
                <path d="M30 8 l1.7 3.6 l3.8 .5 l-2.8 2.7 l.7 3.9 l-3.4 -1.9 l-3.4 1.9 l.7 -3.9 l-2.8 -2.7 l3.8 -.5 z" fill="currentColor" stroke="none" opacity=".6" />
              </svg>
            </div>
            <div>
              <div class="eyebrow">{{ i18n.info_admin_title() }}</div>
              <p>{{ i18n.info_admin_text() }}</p>
            </div>
          </div>
        </div>

        <div class="note">
          <div class="eyebrow">{{ i18n.info_create_title() }}</div>
          <p>{{ i18n.create_info() }}</p>
          <ion-button size="small" fill="outline" color="secondary" (click)="openSupportChat()">
            <ion-icon slot="start" src="{{ 'chatbubbles' | svgIcon }}" />
            {{ i18n.info_support_link() }}
          </ion-button>
        </div>
      </div>
    </ion-content>
  `,
})
export class GroupInfoModal {
  protected readonly i18n = inject(I18nService).translateAll(GROUP_I18N_KEYS) as GroupI18n;
  private readonly modalController = inject(ModalController);

  /**
   * Close first, then let the opener navigate (GroupStore.showInfo): navigating out from
   * under a presented modal leaves the Ionic overlay stack behind.
   */
  protected async openSupportChat(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'supportChat');
  }
}
