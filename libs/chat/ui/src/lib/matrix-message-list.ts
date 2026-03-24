import { Component, computed, effect, input, output, viewChild, ElementRef } from '@angular/core';
import { AsyncPipe, CommonModule } from '@angular/common';
import { IonIcon, IonChip, IonAvatar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { MatrixMessage } from '@bk2/shared-models';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-matrix-message-list',
  standalone: true,
  imports: [
    CommonModule, 
    IonIcon, IonChip, IonAvatar,
    SvgIconPipe, TranslatePipe, AsyncPipe
  ],
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;      /* required so flex child can shrink below content size */
      overflow: hidden;
      background: var(--ion-background-color, #fff);
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .message-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .message-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    .message-row.own-message {
      flex-direction: row-reverse;
    }

    .message-avatar {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      margin-top: 4px;
    }

    .message-avatar.hidden {
      visibility: hidden;
    }

    /* Own-message avatars take no space; bubble hugs the right edge */
    .own-message .message-avatar {
      display: none;
    }

    .message-content {
      display: flex;
      flex-direction: column;
      max-width: 70%;
      gap: 2px;
    }

    .own-message .message-content {
      align-items: flex-end;
      margin-right: 10px;
    }

    .message-sender {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--ion-color-medium);
      padding: 0 8px;
    }

    .message-bubble {
      background: var(--ion-color-light);
      border-radius: 12px;
      padding: 8px 12px;
      word-wrap: break-word;
      position: relative;
    }

    .own-message .message-bubble {
      background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast);
    }

    .message-bubble.edited::after {
      content: ' (edited)';
      font-size: 0.7rem;
      opacity: 0.7;
      font-style: italic;
    }

    .message-bubble.redacted {
      opacity: 0.5;
      font-style: italic;
    }

    .message-text {
      white-space: pre-wrap;
      margin: 0;
    }

    .message-image {
      max-width: 100%;
      max-height: 300px;
      border-radius: 8px;
      cursor: pointer;
    }

    .message-file {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: var(--ion-color-light-shade);
      border-radius: 8px;
      cursor: pointer;
    }

    .message-audio {
      max-width: 100%;
      min-width: 200px;
      display: block;
    }

    .message-location-map {
      display: block;
      text-decoration: none;
      color: inherit;
      border-radius: 8px;
      overflow: hidden;
    }

    .location-tile-wrapper {
      position: relative;
      width: 256px;
      height: 160px;
      overflow: hidden;
    }

    .location-tile-img {
      position: absolute;
      width: 256px;
      height: 256px;
      display: block;
    }

    .location-pin {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -100%);
      font-size: 24px;
      filter: drop-shadow(0 2px 2px rgba(0,0,0,0.4));
      pointer-events: none;
    }

    .location-map-label {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      font-size: 0.8rem;
      color: var(--ion-color-medium);
      background: var(--ion-color-light-shade);
    }

    .message-timestamp {
      font-size: 0.7rem;
      color: var(--ion-color-medium);
      padding: 0 8px;
    }

    .own-message .message-timestamp {
      text-align: right;
    }

    .message-actions {
      display: flex;
      gap: 4px;
      margin-top: 4px;
    }

    .message-reactions {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    .reaction-chip {
      --background: var(--ion-color-light-shade);
      height: 24px;
      font-size: 0.875rem;
    }

    .thread-indicator {
      font-size: 0.75rem;
      color: var(--ion-color-primary);
      cursor: pointer;
      padding: 4px 8px;
      margin-top: 4px;
    }

    .day-divider {
      text-align: center;
      margin: 16px 0;
      color: var(--ion-color-medium);
      font-size: 0.875rem;
      font-weight: 500;
    }

    .notice-row {
      display: flex;
      justify-content: center;
      margin: 4px 0;
    }

    .notice-bubble {
      background: var(--ion-color-light-shade);
      border-radius: 12px;
      padding: 4px 12px;
      font-size: 0.8rem;
      color: var(--ion-color-medium);
      font-style: italic;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--ion-color-medium);
    }

    .typing-bubble {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0 4px 40px;
    }

    .typing-dots {
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--ion-color-light);
      border-radius: 12px;
      padding: 8px 14px;
    }

    .typing-dots span {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ion-color-medium);
      animation: typingBounce 1.2s infinite ease-in-out;
    }

    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typingBounce {
      0%, 60%, 100% { transform: translateY(0); }
      30%            { transform: translateY(-5px); }
    }

    .typing-label {
      font-size: 0.75rem;
      color: var(--ion-color-medium);
      font-style: italic;
    }
  `],
  template: `
    <div class="messages-container" #messagesContainer>
      @if (messages().length === 0 && typingUsers().length === 0) {
        <div class="empty-state">
          <p>{{'@chat.fields.noMessagesStartConversation' | translate | async }}</p>
        </div>
      } @else {
        @for (dayGroup of groupedMessages(); track dayGroup.date) {
          <div class="day-divider">{{ dayGroup.date }}</div>
          
          @for (message of dayGroup.messages; track message.eventId) {
            @if (message.type === 'm.notice') {
              <div class="notice-row">
                <div class="notice-bubble">{{ message.body }} · {{ formatTime(message.timestamp) }}</div>
              </div>
            } @else {
            <div
              class="message-row"
              [class.own-message]="isOwnMessage(message)"
            >
              <ion-avatar 
                class="message-avatar"
                [class.hidden]="shouldHideAvatar(message, $index, dayGroup.messages)"
              >
                @if (message.senderAvatar) {
                  <img [src]="message.senderAvatar" [alt]="message.senderName" />
                } @else {
                  <div>{{ message.senderName.charAt(0) }}</div>
                }
              </ion-avatar>

              <div class="message-content">
                @if (!isOwnMessage(message) && shouldShowSender(message, $index, dayGroup.messages)) {
                  <div class="message-sender">{{ message.senderName }}</div>
                }

                <div 
                  class="message-bubble"
                  [class.edited]="message.isEdited"
                  [class.redacted]="message.isRedacted"
                  (click)="messageClicked.emit(message)"
                >
                  @if (message.isRedacted) {
                    <p class="message-text">Message deleted</p>
                  } @else {
                    @switch (message.type) {
                      @case ('m.text') {
                        @if (message.content.formatted_body) {
                          <p class="message-text" [innerHTML]="message.content.formatted_body"></p>
                        } @else {
                          <p class="message-text">{{ message.body }}</p>
                        }
                      }
                      @case ('m.image') {
                        @if (message.mediaUrl) {
                          <img
                            [src]="message.mediaUrl"
                            [alt]="message.body"
                            class="message-image"
                            (click)="imageClicked.emit(message); $event.stopPropagation()"
                          />
                        }
                        @if (message.body) {
                          <p class="message-text">{{ message.body }}</p>
                        }
                      }
                      @case ('m.file') {
                        @if (isImageFile(message) && message.mediaUrl) {
                          <img
                            [src]="message.mediaUrl"
                            [alt]="message.body"
                            class="message-image"
                            (click)="imageClicked.emit(message); $event.stopPropagation()"
                          />
                          @if (message.body) {
                            <p class="message-text">{{ message.body }}</p>
                          }
                        } @else if (isAudioFile(message) && message.mediaUrl) {
                          <audio
                            controls
                            class="message-audio"
                            [src]="message.mediaUrl"
                            (click)="$event.stopPropagation()"
                          ></audio>
                        } @else {
                          <div class="message-file" (click)="fileClicked.emit(message); $event.stopPropagation()">
                            <ion-icon src="{{'document' | svgIcon}}"></ion-icon>
                            <span>{{ message.body }}</span>
                          </div>
                        }
                      }
                      @case ('m.location') {
                        <a
                          [href]="message.content.info?.maps_link || getGoogleMapsUrl(message)"
                          target="_blank"
                          class="message-location-map"
                          (click)="$event.stopPropagation()"
                        >
                          @if (getOsmTileData(message); as td) {
                            <div class="location-tile-wrapper">
                              <img
                                [src]="td.url"
                                [style.left.px]="td.offsetX"
                                [style.top.px]="td.offsetY"
                                alt="Karte"
                                class="location-tile-img"
                              />
                              <span class="location-pin">📍</span>
                            </div>
                          }
                          <div class="location-map-label">
                            <ion-icon src="{{'location' | svgIcon}}"></ion-icon>
                            <span>{{ message.body }}</span>
                          </div>
                        </a>
                      }
                      @default {
                        <p class="message-text">{{ message.body }}</p>
                      }
                    }
                  }
                </div>

                <div class="message-timestamp">
                  {{ formatTime(message.timestamp) }}
                </div>

                @if (message.reactions && message.reactions.size > 0) {
                  <div class="message-reactions">
                    @for (reaction of getReactions(message); track reaction.emoji) {
                      <ion-chip 
                        class="reaction-chip"
                        (click)="reactionClicked.emit({messageId: message.eventId, emoji: reaction.emoji})"
                      >
                        {{ reaction.emoji }} {{ reaction.count }}
                      </ion-chip>
                    }
                  </div>
                }

                @if (threadReplyCounts().get(message.eventId); as replyCount) {
                  <div
                    class="thread-indicator"
                    (click)="threadClicked.emit(message.eventId)"
                  >
                    <ion-icon src="{{'chatbox' | svgIcon}}"></ion-icon>
                    {{ replyCount }} {{ replyCount === 1 ? 'Antwort' : 'Antworten' }}
                  </div>
                }
              </div>
            </div>
            }
          }
        }
      }

      @if (typingUsers().length > 0) {
        <div class="typing-bubble">
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
          <span class="typing-label">{{ formatTypingLabel() }}</span>
        </div>
      }
    </div>
  `
})
export class MatrixMessageList {
  messages = input.required<MatrixMessage[]>();
  currentUserId = input<string>();
  homeserverUrl = input<string>('https://bkchat.etke.host');
  typingUsers = input<string[]>([]);
  threadReplyCounts = input<Map<string, number>>(new Map());

  messageClicked = output<MatrixMessage>();
  imageClicked = output<MatrixMessage>();
  fileClicked = output<MatrixMessage>();
  reactionClicked = output<{messageId: string, emoji: string}>();
  threadClicked = output<string>();

  messagesContainer = viewChild<ElementRef>('messagesContainer');

  groupedMessages = computed(() => {
    const messages = this.messages();
    const groups: { date: string; messages: MatrixMessage[] }[] = [];
    
    let currentDate = '';
    let currentGroup: MatrixMessage[] = [];

    for (const message of messages) {
      const messageDate = this.formatDate(message.timestamp);
      
      if (messageDate !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, messages: currentGroup });
        }
        currentDate = messageDate;
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    }

    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, messages: currentGroup });
    }

    return groups;
  });

  constructor() {
    effect(() => {
      const msgs = this.messages(); // scroll whenever messages change
      if (msgs.length > 0) {
        setTimeout(() => {
          const container = this.messagesContainer()?.nativeElement;
          if (container) container.scrollTop = container.scrollHeight;
        }, 50);
      }
    });
  }

  isOwnMessage(message: MatrixMessage): boolean {
    return message.sender === this.currentUserId();
  }

  shouldHideAvatar(message: MatrixMessage, index: number, messages: MatrixMessage[]): boolean {
    if (this.isOwnMessage(message)) return true;
    if (index === 0) return false;
    
    const prevMessage = messages[index - 1];
    return prevMessage.sender === message.sender && 
           message.timestamp - prevMessage.timestamp < 60000; // 1 minute
  }

  shouldShowSender(message: MatrixMessage, index: number, messages: MatrixMessage[]): boolean {
    if (index === 0) return true;
    
    const prevMessage = messages[index - 1];
    return prevMessage.sender !== message.sender;
  }

  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Heute';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Gestern';
    } else {
      return date.toLocaleDateString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  getMediaUrl(mxcUrl: string | undefined): string {
    if (!mxcUrl || !mxcUrl.startsWith('mxc://')) return '';
    const parts = mxcUrl.substring(6).split('/');
    return `${this.homeserverUrl()}/_matrix/media/v3/download/${parts[0]}/${parts[1]}`;
  }

  isImageFile(message: MatrixMessage): boolean {
    const mimetype = message.content?.info?.mimetype || '';
    if (mimetype.startsWith('image/')) return true;
    return /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(message.body || '');
  }

  isAudioFile(message: MatrixMessage): boolean {
    const mimetype = message.content?.info?.mimetype || '';
    if (mimetype.startsWith('audio/')) return true;
    return /\.(mp3|ogg|wav|flac|aac|webm|m4a|opus)$/i.test(message.body || '');
  }

  getGoogleMapsUrl(message: MatrixMessage): string {
    const geoUri = message.content?.geo_uri as string | undefined;
    if (geoUri?.startsWith('geo:')) {
      const coords = geoUri.substring(4).split(';')[0];
      return `https://www.google.com/maps/search/?api=1&query=${coords}`;
    }
    return '#';
  }

  private readonly _tileCache = new Map<string, { url: string; offsetX: number; offsetY: number }>();

  getOsmTileData(message: MatrixMessage): { url: string; offsetX: number; offsetY: number } | undefined {
    if (this._tileCache.has(message.eventId)) return this._tileCache.get(message.eventId);
    const geoUri = message.content?.geo_uri as string | undefined;
    if (!geoUri?.startsWith('geo:')) return undefined;
    const [latStr, lonStr] = geoUri.substring(4).split(';')[0].split(',');
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) return undefined;

    const z = 16;
    const n = 1 << z;
    const xFull = (lon + 180) / 360 * n;
    const latRad = lat * Math.PI / 180;
    const yFull = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    const x = Math.floor(xFull);
    const y = Math.floor(yFull);

    // Pixel position of the point within the 256×256 tile
    const pixelX = (xFull - x) * 256;
    const pixelY = (yFull - y) * 256;

    // Shift tile so the point lands at the wrapper center (128, 80)
    const result = {
      url: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      offsetX: 128 - pixelX,
      offsetY: 80 - pixelY,
    };
    this._tileCache.set(message.eventId, result);
    return result;
  }

  formatTypingLabel(): string {
    const users = this.typingUsers();
    if (users.length === 1) return `${users[0]} tippt…`;
    if (users.length === 2) return `${users[0]} und ${users[1]} tippen…`;
    return `${users[0]} und ${users.length - 1} weitere tippen…`;
  }

  getReactions(message: MatrixMessage): { emoji: string; count: number }[] {
    if (!message.reactions) return [];
    
    return Array.from(message.reactions.entries()).map(([emoji, users]) => ({
      emoji,
      count: users.size
    }));
  }
}
