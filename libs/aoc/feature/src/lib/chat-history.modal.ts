import { Component, inject, input } from '@angular/core';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonNote, IonSpinner, IonTitle, IonToolbar, ModalController
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { AocChatStore, RoomMessageInfo } from './aoc-chat.store';

/**
 * An admin's READ-ONLY window into a room they are not in.
 *
 * Deliberately not a chat: no composer, no reactions, no read receipts. The admin reads
 * through the Synapse admin API (`getRoomMessages`), so nothing joins the room and no member
 * sees that anyone looked — which is the only reason a tenant admin may see a
 * `chatMode: 'members'` group's traffic at all. The hint line says exactly that, because an
 * admin who assumes they have joined would answer in the wrong place.
 *
 * Newest first: the CF paginates backwards from the live end, and an admin opening a history
 * wants the latest message, not the room's first one.
 *
 * The store owns the paging state and opens this modal through a dynamic import — injecting
 * the store back into a statically imported modal is what breaks Ionic's overlay creation.
 */
@Component({
  selector: 'okr-chat-history-modal',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonNote, IonSpinner,
  ],
  styles: [`
    .hint { display: block; padding: 0.5rem 1rem; font-size: 0.8rem; }
    .message-body { white-space: pre-wrap; }
    .redacted { font-style: italic; opacity: 0.6; }
    .more { display: flex; justify-content: center; padding: 1rem; }
    .empty-state { padding: 2rem 1rem; text-align: center; }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ store.i18n.chat_history_header() }}{{ roomName() ? ' · ' + roomName() : '' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">
            <ion-icon slot="icon-only" src="{{ 'close' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-note class="hint" color="medium">{{ store.i18n.chat_history_hint() }}</ion-note>
      @if (store.historyLoading() && store.history().length === 0) {
        <div class="more"><ion-spinner /></div>
      } @else if (store.history().length === 0) {
        <div class="empty-state">{{ store.i18n.chat_history_empty() }}</div>
      } @else {
        <ion-list>
          @for (message of store.history(); track message.eventId) {
            <ion-item lines="full">
              <ion-label class="ion-text-wrap">
                <ion-note color="medium" style="font-size:0.75rem">
                  {{ message.senderName }} · {{ formatTimestamp(message.timestamp) }}
                </ion-note>
                @if (message.isRedacted) {
                  <div class="message-body redacted">{{ store.i18n.chat_history_redacted() }}</div>
                } @else {
                  <div class="message-body">{{ displayBody(message) }}</div>
                }
              </ion-label>
            </ion-item>
          }
        </ion-list>
        @if (store.historyHasMore()) {
          <div class="more">
            @if (store.historyLoading()) {
              <ion-spinner />
            } @else {
              <ion-button fill="clear" (click)="store.loadOlderHistory()">{{ store.i18n.chat_history_more() }}</ion-button>
            }
          </div>
        }
      }
    </ion-content>
  `,
})
export class ChatHistoryModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(AocChatStore);

  public readonly roomName = input<string>('');

  protected formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  /** A media message carries a filename in `body`; name the kind so it is not read as text. */
  protected displayBody(message: RoomMessageInfo): string {
    if (message.msgtype === 'm.text' || message.msgtype === 'm.notice' || message.msgtype === 'm.emote') {
      return message.body;
    }
    return `[${message.msgtype}] ${message.body}`.trim();
  }

  protected async close(): Promise<void> {
    await this.modalController.dismiss();
  }
}
