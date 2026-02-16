import { Component, computed, input, output, viewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonAvatar, IonIcon, IonChip } from '@ionic/angular/standalone';
import { MatrixMessage } from '@bk2/cms-section-data-access';

@Component({
  selector: 'bk-matrix-message-list',
  standalone: true,
  imports: [
    CommonModule, 
    IonAvatar, IonIcon, IonChip
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
          <p>No messages yet. Start the conversation!</p>
        </div>
      } @else {
        @for (dayGroup of groupedMessages(); track dayGroup.date) {
          <div class="day-divider">{{ dayGroup.date }}</div>
          
          @for (message of dayGroup.messages; track message.eventId) {
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
                  (contextmenu)="messageContextMenu.emit(message); $event.preventDefault()"
                >
                  @if (message.isRedacted) {
                    <p class="message-text">Message deleted</p>
                  } @else {
                    @switch (message.type) {
                      @case ('m.text') {
                        <p class="message-text">{{ message.body }}</p>
                      }
                      @case ('m.image') {
                        <img 
                          [src]="getMediaUrl(message.content.url)" 
                          [alt]="message.body"
                          class="message-image"
                          (click)="imageClicked.emit(message); $event.stopPropagation()"
                        />
                        @if (message.body) {
                          <p class="message-text">{{ message.body }}</p>
                        }
                      }
                      @case ('m.file') {
                        <div class="message-file" (click)="fileClicked.emit(message); $event.stopPropagation()">
                          <ion-icon name="document-outline"></ion-icon>
                          <span>{{ message.body }}</span>
                        </div>
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
                            <ion-icon name="location-outline"></ion-icon>
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
                    <ion-icon name="chatbox-outline"></ion-icon>
                    View thread
                  </div>
                }
              </div>
            </div>
          }
        }
      }
    </div>
  `
})
export class MatrixMessageListComponent implements AfterViewInit {
  messages = input.required<MatrixMessage[]>();
  currentUserId = input<string>();
  homeserverUrl = input<string>('https://matrix.bkchat.etke.host');

  messageClicked = output<MatrixMessage>();
  messageContextMenu = output<MatrixMessage>();
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

  ngAfterViewInit() {
    this.scrollToBottom();
  }

  private scrollToBottom() {
    setTimeout(() => {
      const container = this.messagesContainer()?.nativeElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
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

  getMediaUrl(mxcUrl: string): string {
    if (!mxcUrl || !mxcUrl.startsWith('mxc://')) return '';
    
    const parts = mxcUrl.substring(6).split('/');
    const serverName = parts[0];
    const mediaId = parts[1];
    
    return `${this.homeserverUrl()}/_matrix/media/r0/download/${serverName}/${mediaId}`;
  }

  getReactions(message: MatrixMessage): { emoji: string; count: number }[] {
    if (!message.reactions) return [];
    
    return Array.from(message.reactions.entries()).map(([emoji, users]) => ({
      emoji,
      count: users.size
    }));
  }
}
