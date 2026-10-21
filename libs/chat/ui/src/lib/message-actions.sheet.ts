import { Component, inject, input } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, ModalController } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { MessageActionId, MessageActions, PIN_ICON, QUICK_REACTIONS } from '@okr/chat-util';

/** Resolved labels of the message sheet: one per action, plus the section title and the «+» label. */
export type MessageActionLabels = Record<MessageActionId, string> & {
  /** «Nachricht» — header of the list section. */
  section: string;
  /** Accessible label of the «+» button that opens the full emoji list. */
  moreReactions: string;
};

/** Icon per action (spec 1.109 §3); fixed here so every caller shows the same sheet. */
const ACTION_ICONS: Record<MessageActionId, string> = {
  'reply': 'return_reply',
  'reply.private': 'return_reply',
  'reply.all': 'return_reply',
  'thread': 'branch',
  'forward': 'share',
  'copy': 'copy',
  'bookmark': 'text',
  'bookmark.remind': 'alarm',
  'pin': PIN_ICON,
  'unpin': PIN_ICON,
  'unreadFromHere': 'mail',
  'share': 'share',
  'download': 'download',
  'info': 'information-circle',
  'edit': 'edit',
  'delete': 'trash',
  'report': 'alert-circle',
  'poll.results': 'chart',
  'poll.edit': 'edit',
  'poll.end': 'cancel-circle',
  'bookmark.open': 'link',
  'bookmark.reminder': 'alarm',
};

/**
 * The bottom sheet shown when a message is tapped (spec 1.109 §3): quick reactions · up to four
 * tiles · the «Nachricht» list · the red rows. Presentational — `getMessageActions` decides what
 * is shown; the sheet dismisses with `{ role: 'action', data: id }`, `{ role: 'react', data: emoji }`
 * or `{ role: 'picker' }` and the feature runs the action.
 */
@Component({
  selector: 'okr-message-actions-sheet',
  standalone: true,
  imports: [IonContent, IonList, IonListHeader, IonItem, IonLabel, IonIcon, SvgIconPipe],
  styles: [`
    .reactions {
      display: flex; align-items: center; justify-content: space-between; gap: 4px;
      padding: 16px 16px 8px;
    }
    .reaction, .more {
      width: 44px; height: 44px; border-radius: 50%; border: none; padding: 0;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
      background: var(--ion-background-color-step-100, var(--ion-color-light));
      color: var(--ion-text-color);
    }
    .reaction { font-size: 1.6rem; background: transparent; }
    .more { font-size: 1.5rem; font-weight: 500; }
    .reaction:active, .more:active, .tile:active { opacity: 0.6; }
    .tiles {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;
      padding: 8px 16px;
    }
    .tile {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
      min-height: 72px; padding: 10px 4px; border: none; border-radius: 12px; cursor: pointer;
      background: var(--ion-background-color-step-100, var(--ion-color-light));
      color: var(--ion-text-color); font: inherit; font-size: 0.75rem; line-height: 1.2; text-align: center;
    }
    .tile ion-icon { font-size: 1.5rem; }
    .tile span { overflow-wrap: anywhere; }
  `],
  template: `
    <ion-content>
      @if (actions().reactions) {
        <div class="reactions">
          @for (emoji of quickReactions(); track emoji) {
            <button type="button" class="reaction" [attr.aria-label]="emoji" (click)="react(emoji)">{{ emoji }}</button>
          }
          <button type="button" class="more" [attr.aria-label]="labels().moreReactions" (click)="picker()">+</button>
        </div>
      }
      @if (actions().tiles.length > 0) {
        <div class="tiles">
          @for (a of actions().tiles; track a.id) {
            <button type="button" class="tile" (click)="choose(a.id)">
              <ion-icon src="{{ icon(a.id) | svgIcon }}" />
              <span>{{ labels()[a.id] }}</span>
            </button>
          }
        </div>
      }
      @if (actions().list.length > 0 || actions().danger.length > 0) {
        <ion-list lines="none">
          @if (actions().list.length > 0) {
            <ion-list-header>
              <ion-label>{{ labels().section }}</ion-label>
            </ion-list-header>
          }
          @for (a of actions().list; track a.id) {
            <ion-item button detail="false" (click)="choose(a.id)">
              <ion-icon slot="start" src="{{ icon(a.id) | svgIcon }}" />
              <ion-label>{{ labels()[a.id] }}</ion-label>
            </ion-item>
          }
          @for (a of actions().danger; track a.id) {
            <ion-item button detail="false" (click)="choose(a.id)">
              <ion-icon slot="start" color="danger" src="{{ icon(a.id) | svgIcon }}" />
              <ion-label color="danger">{{ labels()[a.id] }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class MessageActionsSheet {
  private readonly modalController = inject(ModalController);

  public readonly actions = input.required<MessageActions>();
  public readonly labels = input.required<MessageActionLabels>();
  public readonly quickReactions = input<readonly string[]>(QUICK_REACTIONS);

  protected icon(id: MessageActionId): string {
    return ACTION_ICONS[id];
  }

  protected choose(id: MessageActionId): void {
    void this.modalController.dismiss(id, 'action');
  }

  protected react(emoji: string): void {
    void this.modalController.dismiss(emoji, 'react');
  }

  protected picker(): void {
    void this.modalController.dismiss(undefined, 'picker');
  }
}
