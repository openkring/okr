import { Component, inject } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonItem, IonLabel } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';

import { MatrixChatStore } from './matrix-chat.store';

/**
 * Explains the chat composer's shortcuts (mentions, date/location inserters, send/newline)
 * and the direct- vs. group-chat distinction. Read-only; triggered by the (i) button in the
 * chat header. Each shortcut is shown as a monospace token chip next to its explanation so
 * the two are visually distinct — following the ion-card + ion-card-header/-title section
 * convention used by other cards in this codebase (e.g. `comments-card.ts`).
 */
@Component({
  selector: 'okr-chat-help-modal',
  standalone: true,
  imports: [Header, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonLabel],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    ion-item { --padding-start: 0; --inner-padding-end: 0; }
    .shortcut-token {
      display: inline-block;
      min-width: 2.25rem;
      margin-top: 2px;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--ion-color-light);
      color: var(--ion-color-light-contrast);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8rem;
      font-weight: 600;
      text-align: center;
      white-space: nowrap;
    }
  `],
  template: `
    <okr-header [i18n]="{ title: store.i18n.help_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <p class="ion-text-wrap">{{ store.i18n.help_intro() }}</p>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.help_shortcuts_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item lines="none">
            <span slot="start" class="shortcut-token">{{ store.i18n.help_shortcut_mention_token() }}</span>
            <ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_mention_desc() }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <span slot="start" class="shortcut-token">{{ store.i18n.help_shortcut_mentionRoom_token() }}</span>
            <ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_mentionRoom_desc() }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <span slot="start" class="shortcut-token">{{ store.i18n.help_shortcut_mentionMe_token() }}</span>
            <ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_mentionMe_desc() }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <span slot="start" class="shortcut-token">{{ store.i18n.help_shortcut_date_token() }}</span>
            <ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_date_desc() }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <span slot="start" class="shortcut-token">{{ store.i18n.help_shortcut_location_token() }}</span>
            <ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_location_desc() }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <span slot="start" class="shortcut-token">{{ store.i18n.help_shortcut_send_token() }}</span>
            <ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_send_desc() }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <span slot="start" class="shortcut-token">{{ store.i18n.help_shortcut_newline_token() }}</span>
            <ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_newline_desc() }}</ion-label>
          </ion-item>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.help_chats_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.help_chats_direct() }}</ion-label></ion-item>
          <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.help_chats_group() }}</ion-label></ion-item>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `
})
export class ChatHelpModal {
  protected readonly store = inject(MatrixChatStore);
}
