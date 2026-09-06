import { Component, computed, input, output } from '@angular/core';

import { IonList, IonItem, IonItemDivider, IonLabel, IonBadge, IonNote, IonIcon, IonThumbnail } from '@ionic/angular/standalone';

import { MatrixRoom } from '@okr/shared-models';
import { MultiAvatarPipe, SvgIconPipe } from '@okr/shared-pipes';

import { formatMatrixTimestamp, isMatrixPhotoUrl, MatrixChatI18n, splitFavouriteRooms } from '@okr/chat-util';

@Component({
  selector: 'okr-matrix-room-list',
  standalone: true,
  imports: [
    MultiAvatarPipe,
    SvgIconPipe,
    IonList,
    IonItem,
    IonItemDivider,
    IonLabel,
    IonBadge,
    IonNote,
    IonIcon,
    IonThumbnail
],
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
    }

    .room-item {
      cursor: pointer;
      --padding-start: 8px;
      --padding-end: 8px;
    }

    .room-item.selected {
      --background: var(--ion-color-light);
    }

    .room-item.unread {
      font-weight: 600;
    }

    ion-thumbnail {
      width: 30px;
      height: 30px;
    }

    .unread-badge {
      min-width: 20px;
      height: 20px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
    }

    /* Section header above the pinned block and above the rest. Deliberately quiet: the
       block itself carries the meaning, so there is no pin icon on the individual rows. */
    ion-item-divider.section {
      --background: transparent;
      --padding-start: 12px;
      --padding-end: 12px;
      min-height: 30px;
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ion-color-medium);
    }

    ion-item-divider.section ion-icon {
      font-size: 0.8125rem;
      margin-inline-end: 6px;
    }

    .typing-indicator {
      font-size: 0.75rem;
      color: var(--ion-color-primary);
      font-style: italic;
    }
  `],
  template: `
    <ion-list>
      @for (section of sections(); track section.key) {
        @if (section.label) {
          <ion-item-divider class="section">
            @if (section.icon) {
              <ion-icon src="{{ section.icon | svgIcon }}" />
            }
            <ion-label>{{ section.label }}</ion-label>
          </ion-item-divider>
        }
        @for (room of section.rooms; track room.roomId) {
          <ion-item
            button
            [class.selected]="room.roomId === selectedRoomId()"
            [class.unread]="room.unreadCount > 0"
            class="room-item"
            (click)="roomSelected.emit(room.roomId)"
          >
            @if (room.avatar && isPhotoUrl(room.avatar)) {
              <ion-thumbnail slot="start">
                <img [src]="room.avatar" [alt]="room.name" />
              </ion-thumbnail>
            } @else {
              <ion-icon slot="start" src="{{room | multiAvatar | svgIcon}}" />
            }
            <ion-label>
              <div style="display: flex; align-items: center;">
                <span>{{ room.name }}</span>
              </div>
              <ion-note color="medium">{{ formatTimestamp(room.lastMessage?.timestamp || 0) }}</ion-note>
            </ion-label>
            @if (room.unreadCount > 0) {
              <ion-badge slot="end" color="primary" class="unread-badge">
                {{ room.unreadCount > 99 ? '99+' : room.unreadCount }}
              </ion-badge>
            }
          </ion-item>
        }
      }

      @if (visibleRooms().length === 0) {
        <ion-item>
          <ion-label class="ion-text-center">
            <p>{{ i18n().room_none() }}</p>
          </ion-label>
        </ion-item>
      }
    </ion-list>
  `
})
export class MatrixRoomList {
  // inputs
  public readonly i18n = input.required<MatrixChatI18n>();
  rooms = input.required<MatrixRoom[]>();
  selectedRoomId = input<string>();

  roomSelected = output<string>();

  isPhotoUrl = isMatrixPhotoUrl;

  /**
   * The rooms actually worth showing. `!!`-prefixed and "Empty room" entries are Matrix
   * bookkeeping rooms, never a chat a member opened.
   */
  protected readonly visibleRooms = computed(() => this.rooms().filter(
    room => !room.name.startsWith('!!') && !room.name.startsWith('Empty room')
  ));

  /**
   * One section per block. Rooms the user pinned (`m.favourite`) come first under their own
   * heading; without a single pinned room there is only one unlabelled section, so the list
   * looks exactly as it did before the pinning feature.
   */
  protected readonly sections = computed(() => {
    const { favourites, others } = splitFavouriteRooms(this.visibleRooms());
    if (favourites.length === 0) return [{ key: 'all', label: '', icon: '', rooms: others }];
    return [
      { key: 'pinned', label: this.i18n().room_pinned_section(), icon: 'star', rooms: favourites },
      { key: 'all', label: this.i18n().room_all_section(), icon: '', rooms: others },
    ];
  });

  protected formatTimestamp(timestamp: number): string {
    return formatMatrixTimestamp(timestamp, this.i18n().date_yesterday());
  }
}
