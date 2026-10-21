import { Component, inject, input } from '@angular/core';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonNote, IonTitle, IonToolbar, ModalController,
} from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { dismissOverlay } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { ActivePin, MATRIX_CHAT_I18N_KEYS, MatrixChatI18n } from '@okr/chat-util';

/** One row of the pin list: the pin and what to show for it. */
export interface PinnedMessageItem {
  pin: ActivePin;
  senderName: string;
  snippet: string;
}

/**
 * All active pins of the room (spec 1.109 §6), in banner order, each with its scope label.
 * Tapping a row dismisses with that pin's event id and role `jump`; the caller jumps to it.
 */
@Component({
  selector: 'okr-pinned-messages-modal',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote],
  styles: [`
    .pin-line { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .pin-sender { font-weight: 600; }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">{{ i18n.cancel() }}</ion-button>
        </ion-buttons>
        <ion-title>{{ title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list lines="full">
        @for (item of items(); track item.pin.scope + item.pin.eventId) {
          <ion-item button detail="false" (click)="select(item)">
            <ion-label>
              <p class="pin-line">
                @if (item.senderName) { <span class="pin-sender">{{ item.senderName }}:</span> }
                {{ item.snippet }}
              </p>
            </ion-label>
            <ion-note slot="end">{{ item.pin.scope === 'shared' ? i18n.pin_label_all() : i18n.pin_label_me() }}</ion-note>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class PinnedMessagesModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(MATRIX_CHAT_I18N_KEYS) as MatrixChatI18n;

  public readonly items = input.required<PinnedMessageItem[]>();

  protected title(): string {
    return fill(this.i18n.pin_list(), { n: this.items().length });
  }

  protected async select(item: PinnedMessageItem): Promise<void> {
    await dismissOverlay(this.modalController, item.pin.eventId, 'jump');
  }

  protected async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }
}
