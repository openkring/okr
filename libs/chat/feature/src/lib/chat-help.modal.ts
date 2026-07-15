import { Component, inject } from '@angular/core';
import { IonContent, IonList, IonItem, IonLabel, IonListHeader } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';

import { MatrixChatStore } from './matrix-chat.store';

@Component({
  selector: 'okr-chat-help-modal',
  standalone: true,
  imports: [Header, IonContent, IonList, IonItem, IonLabel, IonListHeader],
  template: `
    <okr-header [i18n]="{ title: store.i18n.help_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <p>{{ store.i18n.help_intro() }}</p>

      <ion-list>
        <ion-list-header><ion-label>{{ store.i18n.help_shortcuts_title() }}</ion-label></ion-list-header>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_mention() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_mentionRoom() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_date() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_location() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.help_shortcut_send() }}</ion-label></ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header><ion-label>{{ store.i18n.help_chats_title() }}</ion-label></ion-list-header>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.help_chats_direct() }}</ion-label></ion-item>
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ store.i18n.help_chats_group() }}</ion-label></ion-item>
      </ion-list>
    </ion-content>
  `
})
export class ChatHelpModal {
  protected readonly store = inject(MatrixChatStore);
}
