import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonList, IonItem, IonLabel, IonBadge, IonNote, IonIcon, IonThumbnail } from '@ionic/angular/standalone';

import { MatrixRoom } from '@bk2/shared-models';
import { MultiAvatarPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { formatMatrixTimestamp, getMatrixTypingText, isMatrixPhotoUrl } from '@bk2/chat-util';


@Component({
  selector: 'bk-matrix-room-list',
  standalone: true,
  imports: [
    CommonModule, MultiAvatarPipe, SvgIconPipe,
    IonList, IonItem, IonLabel, IonBadge, IonNote, IonIcon, IonThumbnail
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
            <p>No rooms yet</p>
          </ion-label>
        </ion-item>
      }
    </ion-list>
  `
})
export class MatrixRoomList {
  rooms = input.required<MatrixRoom[]>();
  selectedRoomId = input<string>();

  roomSelected = output<string>();

  isPhotoUrl = isMatrixPhotoUrl;
  formatTimestamp = formatMatrixTimestamp;
  getTypingText = getMatrixTypingText;

  getRoomInitial(name: string): string {
    return name ? name.charAt(0).toUpperCase() : '?';
  }
}
