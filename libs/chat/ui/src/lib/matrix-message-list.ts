import { Component, computed, effect, input, output, viewChild, ElementRef } from '@angular/core';
import { AsyncPipe, CommonModule } from '@angular/common';
import { IonIcon, IonChip, IonAvatar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { MatrixMessage, MatrixReadReceipt } from '@bk2/shared-models';
import { MatrixReadReceiptStrip } from './matrix-read-receipt-strip';
import { TranslatePipe } from '@bk2/shared-i18n';
import { PollMessageComponent } from './poll-message.component';
import { groupMessages, ImageBatchGroup, MessageOrBatch } from '@bk2/chat-util';

@Component({
  selector: 'bk-matrix-message-list',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon, IonChip, IonAvatar,
    SvgIconPipe, TranslatePipe, AsyncPipe,
    PollMessageComponent, MatrixReadReceiptStrip
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
      background: #1aa76345;
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

    .image-batch-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .image-batch-thumb {
      width: 72px;
      height: 72px;
      object-fit: cover;
      border-radius: 6px;
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
          
          @for (item of dayGroup.messages; track trackItem(item); let i = $index) {
            @if (isBatch(item)) {
              <div class="message-row" [class.own-message]="item.sender === currentUserId()">
                <ion-avatar
                  class="message-avatar"
                  [class.hidden]="shouldHideAvatarForItem(item, i, dayGroup.messages)"
                >
                  @if (item.senderAvatar) {
                    <img [src]="item.senderAvatar" [alt]="item.senderName" />
                  } @else {
                    <div>{{ item.senderName.charAt(0) }}</div>
                  }
                </ion-avatar>
                <div class="message-content">
                  @if (item.sender !== currentUserId() && shouldShowSenderForItem(item, i, dayGroup.messages)) {
                    <div class="message-sender">{{ item.senderName }}</div>
                  }
                  <div class="message-bubble">
                    <div class="image-batch-grid">
                      @for (msg of item.messages; track msg.eventId) {
                        @if (msg.mediaUrl) {
                          <img
                            [src]="msg.mediaUrl"
                            [alt]="msg.body"
                            class="image-batch-thumb"
                            (click)="imageClicked.emit({ message: msg, group: item.messages }); $event.stopPropagation()"
                          />
                        }
                      }
                    </div>
                  </div>
                  <div class="message-timestamp">
                    {{ item.messages.length > 1 ? item.messages.length + ' Bilder · ' : '' }}{{ formatTime(item.timestamp) }}
                  </div>
                  @if (receiptsByEventId().get(item.messages[0].eventId); as receipts) {
                    <bk-matrix-read-receipt-strip [receipts]="receipts" />
                  }
                </div>
              </div>
            } @else {
              @if (item.type === 'm.notice') {
                <div class="notice-row">
                  <div class="notice-bubble">{{ item.body }} · {{ formatTime(item.timestamp) }}</div>
                </div>
              } @else {
                <div class="message-row" [class.own-message]="isOwnMessage(item)">
                  <ion-avatar
                    class="message-avatar"
                    [class.hidden]="shouldHideAvatarForItem(item, i, dayGroup.messages)"
                  >
                    @if (item.senderAvatar) {
                      <img [src]="item.senderAvatar" [alt]="item.senderName" />
                    } @else {
                      <div>{{ item.senderName.charAt(0) }}</div>
                    }
                  </ion-avatar>
                  <div class="message-content">
                    @if (!isOwnMessage(item) && shouldShowSenderForItem(item, i, dayGroup.messages)) {
                      <div class="message-sender">{{ item.senderName }}</div>
                    }
                    <div
                      class="message-bubble"
                      [class.edited]="item.isEdited"
                      [class.redacted]="item.isRedacted"
                      (click)="messageClicked.emit(item)"
                    >
                      @if (item.isRedacted) {
                        <p class="message-text">Message deleted</p>
                      } @else {
                        @switch (item.type) {
                          @case ('m.text') {
                            @if (item.content.formatted_body) {
                              <p class="message-text" [innerHTML]="item.content.formatted_body"></p>
                            } @else {
                              <p class="message-text">{{ item.body }}</p>
                            }
                          }
                          @case ('m.file') {
                            @if (isAudioFile(item) && item.mediaUrl) {
                              <audio controls class="message-audio" [src]="item.mediaUrl" (click)="$event.stopPropagation()"></audio>
                            } @else {
                              <div class="message-file" (click)="fileClicked.emit(item); $event.stopPropagation()">
                                <ion-icon src="{{'document' | svgIcon}}"></ion-icon>
                                <span>{{ item.body }}</span>
                              </div>
                            }
                          }
                          @case ('m.location') {
                            <a
                              [href]="item.content.info?.maps_link || getGoogleMapsUrl(item)"
                              target="_blank"
                              class="message-location-map"
                              (click)="$event.stopPropagation()"
                            >
                              @if (getOsmTileData(item); as td) {
                                <div class="location-tile-wrapper">
                                  <img [src]="td.url" [style.left.px]="td.offsetX" [style.top.px]="td.offsetY" alt="Karte" class="location-tile-img" />
                                  <span class="location-pin">📍</span>
                                </div>
                              }
                              <div class="location-map-label">
                                <ion-icon src="{{'location' | svgIcon}}"></ion-icon>
                                <span>{{ item.body }}</span>
                              </div>
                            </a>
                          }
                          @case ('org.matrix.msc3381.poll.start') {
                            <bk-poll-message
                              [message]="item"
                              [currentUserId]="currentUserId() ?? ''"
                              (voteClicked)="pollVoteClicked.emit($event)"
                              (endPollClicked)="pollEndClicked.emit($event)"
                            />
                          }
                          @default {
                            <p class="message-text">{{ item.body }}</p>
                          }
                        }
                      }
                    </div>
                    <div class="message-timestamp">{{ formatTime(item.timestamp) }}</div>
                    @if (receiptsByEventId().get(item.eventId); as receipts) {
                      <bk-matrix-read-receipt-strip [receipts]="receipts" />
                    }
                    @if (item.reactions && item.reactions.size > 0) {
                      <div class="message-reactions">
                        @for (reaction of getReactions(item); track reaction.emoji) {
                          <ion-chip class="reaction-chip" (click)="reactionClicked.emit({ messageId: item.eventId, emoji: reaction.emoji })">
                            {{ reaction.emoji }} {{ reaction.count }}
                          </ion-chip>
                        }
                      </div>
                    }
                    @if (threadReplyCounts().get(item.eventId); as replyCount) {
                      <div class="thread-indicator" (click)="threadClicked.emit(item.eventId)">
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
  receiptsByEventId = input<Map<string, MatrixReadReceipt[]>>(new Map());

  messageClicked = output<MatrixMessage>();
  imageClicked = output<{ message: MatrixMessage; group: MatrixMessage[] }>();
  fileClicked = output<MatrixMessage>();
  reactionClicked = output<{messageId: string, emoji: string}>();
  threadClicked = output<string>();
  pollVoteClicked = output<{ pollEventId: string; answerId: string }>();
  pollEndClicked = output<{ pollEventId: string }>();

  messagesContainer = viewChild<ElementRef>('messagesContainer');

  groupedMessages = computed(() => {
    const messages = this.messages();
    const groups: { date: string; messages: MessageOrBatch[] }[] = [];

    let currentDate = '';
    let currentGroup: MatrixMessage[] = [];

    for (const message of messages) {
      const messageDate = this.formatDate(message.timestamp);
      if (messageDate !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, messages: groupMessages(currentGroup) });
        }
        currentDate = messageDate;
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, messages: groupMessages(currentGroup) });
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

  protected isBatch(item: MessageOrBatch): item is ImageBatchGroup {
    return (item as ImageBatchGroup).kind === 'image-batch';
  }

  protected trackItem(item: MessageOrBatch): string {
    return this.isBatch(item) ? `batch-${item.messages[0].eventId}` : item.eventId;
  }

  protected shouldHideAvatarForItem(item: MessageOrBatch, index: number, items: MessageOrBatch[]): boolean {
    const sender = item.sender;
    if (sender === this.currentUserId()) return true;
    if (index === 0) return false;
    const prev = items[index - 1];
    return prev.sender === sender && item.timestamp - prev.timestamp < 60000;
  }

  protected shouldShowSenderForItem(item: MessageOrBatch, index: number, items: MessageOrBatch[]): boolean {
    if (index === 0) return true;
    return items[index - 1].sender !== item.sender;
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
