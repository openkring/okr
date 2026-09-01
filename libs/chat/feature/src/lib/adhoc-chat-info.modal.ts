import { Component, computed, inject, input } from '@angular/core';
import { IonAvatar, IonButton, IonContent, IonIcon, IonImg, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { dismissOverlay } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';

import { AvatarPipe } from '@okr/avatar-ui';
import { MATRIX_CHAT_I18N_KEYS, MatrixChatI18n } from '@okr/chat-util';

/**
 * Chat-Info eines Ad-hoc-Chats: wer drin ist, und der Austritt
 * (planning/specs/2026-09-01-adhoc-chats-spec.md §5).
 *
 * Nachtraeglich Mitglieder hinzufuegen ist bewusst NICHT hier — das ist offener Punkt §10.2
 * der Spec und noch nicht entschieden.
 *
 * Der Modal fuehrt den Austritt nicht selbst aus: er schliesst mit der Rolle `leave`, und
 * der `MatrixChatStore` fragt nach und ruft die Cloud Function. So bleibt der Modal frei
 * vom Store, der ihn oeffnet.
 */
@Component({
  selector: 'okr-adhoc-chat-info-modal',
  standalone: true,
  imports: [
    Header, AvatarPipe, SvgIconPipe,
    IonContent, IonList, IonItem, IonLabel, IonAvatar, IonImg, IonNote, IonButton, IonIcon
  ],
  styles: [`
    .chat-name { font-size: 1.25rem; font-weight: 600; text-align: center; padding: 20px 16px 4px 16px; }
    .members-title { font-size: 0.8rem; font-weight: 600; color: var(--ion-color-medium); padding: 16px 16px 4px 16px; letter-spacing: 0.02em; }
    .hint { display: block; padding: 8px 16px 16px 16px; }
    .leave { padding: 8px 16px 0 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.adhoc_info_header() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      <div class="chat-name">{{ chatName() }}</div>

      <div class="members-title">{{ i18n.adhoc_members_title() }} · {{ members().length }}</div>
      <ion-list lines="full">
        @for (member of members(); track member.key) {
          <ion-item>
            <ion-avatar slot="start">
              <ion-img src="{{ 'person.' + member.key | avatar }}" alt="Avatar" />
            </ion-avatar>
            <ion-label>{{ member.name1 }} {{ member.name2 }}</ion-label>
            @if (member.key === ownerKey()) {
              <ion-note slot="end">{{ i18n.adhoc_member_you() }}</ion-note>
            }
          </ion-item>
        }
      </ion-list>

      <div class="leave">
        <ion-button expand="block" fill="clear" color="danger" (click)="leave()">
          <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />
          {{ i18n.adhoc_leave() }}
        </ion-button>
      </div>
      <ion-note class="hint" color="medium">{{ i18n.adhoc_leave_hint() }}</ion-note>
    </ion-content>
  `
})
export class AdhocChatInfoModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(MATRIX_CHAT_I18N_KEYS) as MatrixChatI18n;

  // inputs
  public readonly chatName = input.required<string>();
  public readonly members = input.required<AvatarInfo[]>();
  /** personKey der betrachtenden Person — markiert die eigene Zeile mit «du». */
  public readonly currentPersonKey = input<string>('');

  protected readonly ownerKey = computed(() => this.currentPersonKey());

  public async leave(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'leave');
  }
}
