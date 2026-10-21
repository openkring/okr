import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonItem, IonLabel, IonList, IonListHeader,
  IonSearchbar, IonThumbnail, IonIcon, IonTitle, IonToolbar, ModalController,
} from '@ionic/angular';

import { MatrixRoom } from '@okr/shared-models';
import { MultiAvatarPipe, SvgIconPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';
import { dismissOverlay } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { filterRoomsByName, isMatrixPhotoUrl, MATRIX_CHAT_I18N_KEYS, MatrixChatI18n } from '@okr/chat-util';

/** How many rooms the «Zuletzt» section lists. */
const RECENT_COUNT = 5;

/**
 * Picker: choose the target chats of a forwarded message (spec 1.109 §5). The modal does not
 * inject the store; the caller hands in the already filtered rooms and reads the chosen room ids
 * from the dismiss data (role `confirm`).
 */
@Component({
  selector: 'okr-forward-message-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonContent, IonSearchbar, IonList, IonListHeader,
    IonItem, IonLabel, IonCheckbox, IonThumbnail, IonIcon, MultiAvatarPipe, SvgIconPipe,
    NgTemplateOutlet,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">{{ i18n.cancel() }}</ion-button>
        </ion-buttons>
        <ion-title>{{ i18n.forward_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [strong]="true" [disabled]="selected().size === 0" (click)="send()">
            {{ sendLabel() }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar [debounce]="150" (ionInput)="query.set($any($event).detail.value ?? '')" />
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (recent().length > 0) {
        <ion-list lines="full">
          <ion-list-header>{{ i18n.forward_recent() }}</ion-list-header>
          @for (room of recent(); track room.roomId) { <ng-container *ngTemplateOutlet="row; context: { $implicit: room }" /> }
        </ion-list>
      }
      @if (others().length > 0) {
        <ion-list lines="full">
          <ion-list-header>{{ i18n.forward_all() }}</ion-list-header>
          @for (room of others(); track room.roomId) { <ng-container *ngTemplateOutlet="row; context: { $implicit: room }" /> }
        </ion-list>
      }
    </ion-content>
    <ng-template #row let-room>
      <ion-item button (click)="toggle(room.roomId)">
        <ion-checkbox slot="start" [checked]="selected().has(room.roomId)" (click)="$event.stopPropagation()" (ionChange)="toggle(room.roomId)" aria-label="{{ room.name }}" />
        @if (room.avatar && isPhotoUrl(room.avatar)) {
          <ion-thumbnail slot="start"><img [src]="room.avatar" [alt]="room.name" /></ion-thumbnail>
        } @else {
          <ion-icon slot="start" src="{{ room | multiAvatar | svgIcon }}" />
        }
        <ion-label>{{ room.name }}</ion-label>
      </ion-item>
    </ng-template>
  `,
})
export class ForwardMessageModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(MATRIX_CHAT_I18N_KEYS) as MatrixChatI18n;

  /** Rooms the member may post in (hidden rooms already removed by the caller). */
  public readonly rooms = input.required<MatrixRoom[]>();

  protected readonly query = signal('');
  protected readonly selected = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly isPhotoUrl = isMatrixPhotoUrl;

  private readonly byActivity = computed(() =>
    [...this.rooms()].sort((a, b) => (b.lastMessage?.timestamp ?? 0) - (a.lastMessage?.timestamp ?? 0)));
  private readonly recentIds = computed(() => new Set(this.byActivity().slice(0, RECENT_COUNT).map((r) => r.roomId)));

  protected readonly recent = computed(() =>
    filterRoomsByName(this.byActivity().filter((r) => this.recentIds().has(r.roomId)), this.query()));
  protected readonly others = computed(() =>
    filterRoomsByName(
      this.rooms().filter((r) => !this.recentIds().has(r.roomId))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'de', { sensitivity: 'base' })),
      this.query()));
  protected readonly sendLabel = computed(() => fill(this.i18n.forward_send(), { n: this.selected().size }));

  protected toggle(roomId: string): void {
    const next = new Set(this.selected());
    if (!next.delete(roomId)) next.add(roomId);
    this.selected.set(next);
  }

  protected async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }

  protected async send(): Promise<void> {
    if (this.selected().size === 0) return;
    await dismissOverlay(this.modalController, [...this.selected()], 'confirm');
  }
}
