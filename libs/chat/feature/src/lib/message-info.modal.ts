import { Component, inject, input } from '@angular/core';
import { IonAvatar, IonButton, IonChip, IonContent, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, ModalController } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { AlertService, copyToClipboard, dismissOverlay } from '@okr/shared-util-angular';
import { MATRIX_CHAT_I18N_KEYS, MatrixChatI18n, hashUserIdToColor } from '@okr/chat-util';

/** A person in the «Gelesen von» list. */
export interface MessageInfoPerson {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  /** Already formatted time of reading; empty when unknown. */
  timeText?: string;
}

/** A reaction chip: tapping it dismisses with role `reaction` and the emoji as data. */
export interface MessageInfoReaction {
  emoji: string;
  count: number;
}

/**
 * Info of one message (spec 1.109 §7): who sent it, when, what kind, who read it, how it was
 * reacted to — read-only. The caller hands in everything resolved (the modal never touches the
 * store); a tapped reaction chip dismisses with role `reaction` so the caller can open the
 * reaction details. `rawJson` is only passed for admins and shown collapsed.
 */
@Component({
  selector: 'okr-message-info-modal',
  standalone: true,
  imports: [Header, SvgIconPipe, IonContent, IonList, IonListHeader, IonItem, IonLabel, IonNote, IonAvatar, IonChip, IonButton, IonIcon],
  styles: [`
    .avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .avatar-initial {
      width: 100%; height: 100%; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-weight: 600; color: #fff;
    }
    .chips { padding: 4px 16px 8px 16px; }
    .actions { padding: 8px 16px; }
    details.raw { padding: 8px 16px 16px 16px; }
    details.raw summary { cursor: pointer; padding: 8px 0; }
    details.raw pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.7rem;
      overflow: auto; max-height: 40vh; white-space: pre-wrap; word-break: break-word; margin: 0;
    }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.info_title() }" [isModal]="true" />
    <ion-content>
      <ion-list lines="full">
        <ion-item>
          <ion-avatar slot="start">
            @if (senderAvatar()) {
              <img class="avatar-img" [src]="senderAvatar()" [alt]="senderName()" />
            } @else {
              <div class="avatar-initial" [style.background-color]="color(senderId())">{{ senderName().charAt(0).toUpperCase() }}</div>
            }
          </ion-avatar>
          <ion-label>
            <h3>{{ senderName() }}</h3>
            <p>{{ roomName() }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>{{ i18n.info_sent() }}</ion-label>
          <ion-note slot="end">{{ sentText() }}</ion-note>
        </ion-item>
        @if (edited()) {
          <ion-item><ion-label>{{ i18n.info_edited() }}</ion-label></ion-item>
        }
        <ion-item>
          <ion-label>{{ i18n.info_type() }}</ion-label>
          <ion-note slot="end">{{ typeLabel() }}</ion-note>
        </ion-item>
        @if (forwardedLabel()) {
          <ion-item>
            <ion-icon slot="start" src="{{ 'share' | svgIcon }}" />
            <ion-label>{{ forwardedLabel() }}</ion-label>
          </ion-item>
        }
      </ion-list>

      <ion-list lines="none">
        <ion-list-header><ion-label>{{ readByTitle() }}</ion-label></ion-list-header>
        @for (p of readers(); track p.userId) {
          <ion-item>
            <ion-avatar slot="start">
              @if (p.avatarUrl) {
                <img class="avatar-img" [src]="p.avatarUrl" [alt]="p.displayName" />
              } @else {
                <div class="avatar-initial" [style.background-color]="color(p.userId)">{{ p.displayName.charAt(0).toUpperCase() }}</div>
              }
            </ion-avatar>
            <ion-label>{{ p.displayName }}</ion-label>
            @if (p.timeText) { <ion-note slot="end">{{ p.timeText }}</ion-note> }
          </ion-item>
        }
      </ion-list>

      @if (reactions().length) {
        <ion-list lines="none">
          <ion-list-header><ion-label>{{ i18n.info_reactions() }}</ion-label></ion-list-header>
          <div class="chips">
            @for (r of reactions(); track r.emoji) {
              <ion-chip (click)="openReaction(r.emoji)">{{ r.emoji }} {{ r.count }}</ion-chip>
            }
          </div>
        </ion-list>
      }

      <div class="actions">
        <ion-button fill="outline" (click)="copyLink(link())">
          <ion-icon slot="start" src="{{ 'copy' | svgIcon }}" />{{ i18n.info_copy_link() }}
        </ion-button>
        @if (matrixLink(); as matrixLink) {
          <ion-button fill="clear" (click)="copyLink(matrixLink)">
            <ion-icon slot="start" src="{{ 'copy' | svgIcon }}" />{{ i18n.info_copy_matrix_link() }}
          </ion-button>
        }
      </div>

      @if (rawJson()) {
        <details class="raw">
          <summary>{{ i18n.info_raw() }}</summary>
          <pre>{{ rawJson() }}</pre>
        </details>
      }
    </ion-content>
  `,
})
export class MessageInfoModal {
  private readonly modalController = inject(ModalController);
  private readonly alertService = inject(AlertService);
  protected readonly i18n = inject(I18nService).translateAll(MATRIX_CHAT_I18N_KEYS) as MatrixChatI18n;

  public readonly senderId = input.required<string>();
  public readonly senderName = input.required<string>();
  public readonly senderAvatar = input<string | undefined>(undefined);
  public readonly roomName = input('');
  public readonly sentText = input('');
  public readonly edited = input(false);
  public readonly typeLabel = input('');
  /** «Weitergeleitet» / «Weitergeleitet von X»; undefined when the message is not forwarded. */
  public readonly forwardedLabel = input<string | undefined>(undefined);
  /** «Gelesen von (x von y)» */
  public readonly readByTitle = input('');
  public readonly readers = input<MessageInfoPerson[]>([]);
  public readonly reactions = input<MessageInfoReaction[]>([]);
  /** Deep link into this app's chat view, opening the message. */
  public readonly link = input.required<string>();
  /** matrix.to link (opens in Element); only given to admins. */
  public readonly matrixLink = input<string | undefined>(undefined);
  /** Pretty-printed event JSON; only given to admins. */
  public readonly rawJson = input<string | undefined>(undefined);

  protected color(userId: string): string {
    return hashUserIdToColor(userId);
  }

  protected async openReaction(emoji: string): Promise<void> {
    await dismissOverlay(this.modalController, emoji, 'reaction');
  }

  /** The copy starts inside the tap (user-gesture rule); only the toast is awaited. */
  protected copyLink(link: string): void {
    const copied = copyToClipboard(link);
    void copied.then(() => this.alertService.showToast(this.i18n.copy_conf()));
  }
}
