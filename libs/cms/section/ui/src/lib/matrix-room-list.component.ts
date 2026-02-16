import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonList, IonItem, IonLabel, IonBadge, IonAvatar } from '@ionic/angular/standalone';

import { MatrixRoom } from '@bk2/cms-section-data-access';

@Component({
  selector: 'bk-matrix-room-list',
  standalone: true,
  imports: [
    CommonModule, 
    IonList, IonItem, IonLabel, IonBadge, IonAvatar
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

    .room-avatar {
      --border-radius: 8px;
      width: 48px;
      height: 48px;
    }

    .room-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .room-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .room-name {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .room-timestamp {
      font-size: 0.75rem;
      color: var(--ion-color-medium);
    }

    .room-preview {
      font-size: 0.875rem;
      color: var(--ion-color-medium);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-top: 4px;
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
        <ion-item
          button
          [class.selected]="room.roomId === selectedRoomId()"
          [class.unread]="room.unreadCount > 0"
          class="room-item"
          (click)="roomSelected.emit(room.roomId)"
        >
          <ion-avatar slot="start" class="room-avatar">
            @if (room.avatar) {
              <img [src]="room.avatar" [alt]="room.name" />
            } @else {
              <div class="placeholder-avatar">{{ getRoomInitial(room.name) }}</div>
            }
          </ion-avatar>

          <div class="room-info">
            <div class="room-header">
              <span class="room-name">{{ room.name }}</span>
              @if (room.lastMessage) {
                <span class="room-timestamp">
                  {{ formatTimestamp(room.lastMessage.timestamp) }}
                </span>
              }
            </div>

            @if (room.typingUsers.length > 0) {
              <div class="typing-indicator">{{ getTypingText(room.typingUsers) }}</div>
            } @else if (room.lastMessage) {
              <div class="room-preview">
                <strong>{{ room.lastMessage.senderName }}:</strong>
                {{ room.lastMessage.body }}
              </div>
            }
          </div>

          @if (room.unreadCount > 0) {
            <ion-badge slot="end" color="primary" class="unread-badge">
              {{ room.unreadCount > 99 ? '99+' : room.unreadCount }}
            </ion-badge>
          }
        </ion-item>
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
export class MatrixRoomListComponent {
  rooms = input.required<MatrixRoom[]>();
  selectedRoomId = input<string>();

  roomSelected = output<string>();

  getRoomInitial(name: string): string {
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  getTypingText(userIds: string[]): string {
    if (userIds.length === 0) return '';
    if (userIds.length === 1) return 'typing...';
    if (userIds.length === 2) return `${userIds.length} people are typing...`;
    return 'Several people are typing...';
  }
}
