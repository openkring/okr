import { Component, input, output } from '@angular/core';

import { IonList, IonItem, IonLabel, IonBadge, IonNote, IonIcon, IonThumbnail } from '@ionic/angular/standalone';

import { MatrixRoom } from '@okr/shared-models';
import { MultiAvatarPipe, SvgIconPipe } from '@okr/shared-pipes';

import { formatMatrixTimestamp, isMatrixPhotoUrl, MatrixChatI18n } from '@okr/chat-util';

@Component({
  selector: 'okr-matrix-room-list',
  standalone: true,
  imports: [
    MultiAvatarPipe,
    SvgIconPipe,
    IonList,
    IonItem,
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

    .typing-indicator {
      font-size: 0.75rem;
      color: var(--ion-color-primary);
      font-style: italic;
    }
  `],
  template: `
    <ion-list>
      @for (room of rooms(); track room.roomId) {
        @if(!room.name.startsWith('!!') && (!room.name.startsWith('Empty room'))) {
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

      @if (rooms().length === 0) {
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

  protected formatTimestamp(timestamp: number): string {
    return formatMatrixTimestamp(timestamp, this.i18n().date_yesterday());
  }
}
