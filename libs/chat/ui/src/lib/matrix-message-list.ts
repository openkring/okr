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
      height: 100%;
      overflow: hidden;
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

    .message-content {
      display: flex;
      flex-direction: column;
      max-width: 70%;
      gap: 2px;
    }

    .own-message .message-content {
      align-items: flex-end;
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

    .message-bubble::before {
      content: '';
      position: absolute;
      width: 0;
      height: 0;
      border-style: solid;
      top: 0;
      left: -8px;
      border-width: 0 8px 8px 0;
      border-color: transparent var(--ion-color-light) transparent transparent;
    }

    .own-message .message-bubble::before {
      left: auto;
      right: -8px;
      border-width: 0 0 8px 8px;
      border-color: transparent transparent transparent var(--ion-color-primary);
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

    .message-location {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .location-link {
      color: var(--ion-color-primary);
      text-decoration: none;
      font-size: 0.875rem;
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
  `],
  template: `
    <div class="messages-container" #messagesContainer>
      @if (messages().length === 0) {
        <div class="empty-state">
          <p>{{'@chat.fields.noMessagesStartConversation' | translate | async }}</p>
        </div>
      } @else {
        @for (dayGroup of groupedMessages(); track dayGroup.date) {
          <div class="day-divider">{{ dayGroup.date }}</div>
          
          @for (message of dayGroup.messages; track message.eventId) {
            @if (message.type === 'm.notice') {
              <div class="notice-row">
                <div class="notice-bubble">{{ message.body }}</div>
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
                        <p class="message-text">{{ message.body }}</p>
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
                        } @else {
                          <div class="message-file" (click)="fileClicked.emit(message); $event.stopPropagation()">
                            <ion-icon src="{{'document' | svgIcon}}"></ion-icon>
                            <span>{{ message.body }}</span>
                          </div>
                        }
                      }
                      @case ('m.location') {
                        <div class="message-location">
                          <p class="message-text">{{ message.body }}</p>
                          <a 
                            [href]="message.content.info?.thumbnail_url" 
                            target="_blank"
                            class="location-link"
                            (click)="$event.stopPropagation()"
                          >
                            <ion-icon src="{{'location' | svgIcon}}"></ion-icon>
                            View on map
                          </a>
                        </div>
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

                @if (message.relatesTo?.relationType === 'm.thread') {
                  <div 
                    class="thread-indicator"
                    (click)="message.relatesTo && threadClicked.emit(message.relatesTo.eventId)"
                  >
                    <ion-icon src="{{'chatbox' | svgIcon}}"></ion-icon>
                    View thread
                  </div>
                }
              </div>
            </div>
            }
          }
        }
      }
    </div>
  `
})
export class MatrixMessageList {
  messages = input.required<MatrixMessage[]>();
  currentUserId = input<string>();
  homeserverUrl = input<string>('https://bkchat.etke.host');

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
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  }

  formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
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

  getReactions(message: MatrixMessage): { emoji: string; count: number }[] {
    if (!message.reactions) return [];
    
    return Array.from(message.reactions.entries()).map(([emoji, users]) => ({
      emoji,
      count: users.size
    }));
  }
}
