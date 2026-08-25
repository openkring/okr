import { Component, computed, effect, inject, input, output, signal, viewChild, ElementRef, Signal } from '@angular/core';

import { IonIcon, IonChip, IonAvatar, IonSpinner } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { MatrixMessage, MatrixReadReceipt, PersonModelName } from '@okr/shared-models';
import { AvatarService } from '@okr/avatar-data-access';
import { MatrixReadReceiptStrip } from './matrix-read-receipt-strip';
import { PollMessage } from './poll-message';
import { decorateMentionPills, extractMentionLocalpart, formatMatrixDate, formatMatrixTime, groupMessages, ImageBatchGroup, linkifyText, MatrixChatI18n, MessageOrBatch } from '@okr/chat-util';

/** imgix thumbnail size for a mention pill's avatar — 2x the 18px CSS box, for retina. */
const MENTION_AVATAR_SIZE = 36;

@Component({
  selector: 'okr-matrix-message-list',
  standalone: true,
  imports: [
    IonIcon,
    IonChip,
    IonAvatar,
    IonSpinner,
    SvgIconPipe,
    PollMessage,
    MatrixReadReceiptStrip
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

    /* Mention pills live inside [innerHTML], so they carry no _ngcontent attribute and
       emulated encapsulation cannot reach them — hence ::ng-deep under .message-text. */
    .message-text ::ng-deep .okr-mention-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      vertical-align: baseline;
      text-decoration: none;
      font-weight: 600;
      color: var(--ion-color-primary);
    }
    .message-text ::ng-deep .okr-mention-avatar {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      object-fit: cover;
      background: var(--ion-color-light);
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

    /* An attachment whose bytes never arrived: the media download failed, or the upload
       stored an empty object. Without this the tile simply rendered nothing, so a broken
       image was indistinguishable from a message that carried no image at all. */
    .image-batch-thumb.image-broken {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 4px;
      box-sizing: border-box;
      cursor: default;
      text-align: center;
      color: var(--ion-color-medium);
      background: var(--ion-color-light);
      border: 1px dashed var(--ion-color-medium);
    }

    .image-batch-thumb.image-broken ion-icon {
      font-size: 20px;
    }

    .image-batch-thumb.image-broken span {
      font-size: 9px;
      line-height: 1.1;
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
      /* Pull the chips up so they overlap the bubble's bottom edge and read as
         attached to the message they belong to. */
      margin-top: -10px;
      padding: 0 4px;
      position: relative;
      z-index: 1;
    }

    .reaction-chip {
      --background: var(--ion-color-light-shade);
      height: 22px;
      min-height: 22px;
      font-size: 0.8rem;
      border: 1px solid var(--ion-background-color, #fff);
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

    .load-older-spinner {
      display: flex;
      justify-content: center;
      padding: 4px 0;
      flex-shrink: 0;
    }
  `],
  template: `
    <div class="messages-container" #messagesContainer role="log" [attr.aria-label]="i18n().messages_label()" (scroll)="onContainerScroll()">
      @if (loadingOlder()) {
        <div class="load-older-spinner">
          <ion-spinner name="dots" />
        </div>
      }
      @if (messages().length === 0 && typingUsers().length === 0) {
        <div class="empty-state">
          <p>{{ i18n().no_messages_start_conversation() }}</p>
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
                        @if (msg.mediaUrl && !brokenImages().has(msg.eventId)) {
                          <img
                            [src]="msg.mediaUrl"
                            [alt]="msg.body"
                            class="image-batch-thumb"
                            (error)="onImageError(msg.eventId)"
                            (click)="imageClicked.emit({ message: msg, group: item.messages }); $event.stopPropagation()"
                          />
                        } @else {
                          <div class="image-batch-thumb image-broken" [title]="msg.body" [attr.aria-label]="i18n().image_unavailable()">
                            <ion-icon src="{{ 'alert-circle' | svgIcon }}" />
                            <span>{{ i18n().image_unavailable() }}</span>
                          </div>
                        }
                      }
                    </div>
                  </div>
                  <div class="message-timestamp">
                    {{ item.messages.length > 1 ? item.messages.length + ' ' + i18n().images() + ' · ' : '' }}{{ formatTime(item.timestamp) }}
                  </div>
                  @if (receiptsByEventId().get(item.messages[0].eventId); as receipts) {
                    <okr-matrix-read-receipt-strip [receipts]="receipts" />
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
                      (click)="onBubbleClick($event, item)"
                    >
                      @if (item.isRedacted) {
                        <p class="message-text">Message deleted</p>
                      } @else {
                        @switch (item.type) {
                          @case ('m.text') {
                            @if (item.content.formatted_body) {
                              <p class="message-text" [innerHTML]="renderFormattedBody(item)"></p>
                            } @else {
                              <p class="message-text" [innerHTML]="linkify(item.body)"></p>
                            }
                          }
                          @case ('m.file') {
                            @if (isAudioFile(item) && item.mediaUrl) {
                              <audio controls class="message-audio" [src]="item.mediaUrl" (click)="$event.stopPropagation()"></audio>
                            } @else {
                              <!-- No own click handler: let it bubble to the bubble's messageClicked,
                                   so a tap on a file opens the message action sheet (with the share action). -->
                              <div class="message-file">
                                <ion-icon src="{{'document' | svgIcon}}"></ion-icon>
                                <span>{{ item.body }}</span>
                              </div>
                            }
                          }
                          @case ('m.location') {
                            <a
                              [href]="item.content.info?.maps_link || getGoogleMapsUrl(item)"
                              target="_blank"
                              rel="noopener noreferrer"
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
                            <okr-poll-message
                              [message]="item"
                              [currentUserId]="currentUserId() ?? ''"
                              (voteClicked)="pollVoteClicked.emit($event)"
                              [i18n]="i18n()"
                            />
                          }
                          @default {
                            <p class="message-text">{{ item.body }}</p>
                          }
                        }
                      }
                    </div>
                    @if (item.reactions && item.reactions.size > 0) {
                      <div class="message-reactions">
                        @for (reaction of getReactions(item); track reaction.emoji) {
                          <ion-chip class="reaction-chip" role="button" tabindex="0" [attr.aria-label]="reaction.emoji + ' ' + reaction.count" (click)="reactionClicked.emit({ messageId: item.eventId, emoji: reaction.emoji })">
                            {{ reaction.emoji }} {{ reaction.count }}
                          </ion-chip>
                        }
                      </div>
                    }
                    <div class="message-timestamp">{{ formatTime(item.timestamp) }}</div>
                    @if (receiptsByEventId().get(item.eventId); as receipts) {
                      <okr-matrix-read-receipt-strip [receipts]="receipts" />
                    }
                    @if (threadReplyCounts().get(item.eventId); as replyCount) {
                      <div class="thread-indicator" role="button" tabindex="0" [attr.aria-label]="i18n().thread_open()" (click)="threadClicked.emit(item.eventId)" (keydown.enter)="threadClicked.emit(item.eventId)">
                        <ion-icon src="{{'chatbox' | svgIcon}}"></ion-icon>
                        {{ replyCount }} {{ replyCount === 1 ? i18n().thread_replies_one() : i18n().thread_replies_many() }}
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
          <div class="typing-dots" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <span class="typing-label">{{ formatTypingLabel() }}</span>
        </div>
      }
    </div>
  `
})
export class MatrixMessageList {
  private readonly avatarService = inject(AvatarService);

  // inputs
  messages = input.required<MatrixMessage[]>();
  currentUserId = input<string>();
  /** C-5: whether older history may still be loaded by scrolling to the top. */
  hasMoreHistory = input<boolean>(false);
  typingUsers = input<string[]>([]);
  threadReplyCounts = input<Map<string, number>>(new Map());
  receiptsByEventId = input<Map<string, MatrixReadReceipt[]>>(new Map());
  public readonly i18n = input.required<MatrixChatI18n>();


  messageClicked = output<MatrixMessage>();
  /**
   * Emits the (lowercased) Matrix-user-id localpart, together with the owning message,
   * when a mention pill inside a received message's `formatted_body` is clicked — this
   * component stays dumb and has no access to the person list itself, so it cannot tell
   * whether the localpart resolves to a known person. The message rides along so the
   * feature layer can fall back to the normal `messageClicked` action-sheet behaviour
   * when resolution fails (a bridged/bot account, or a member no longer in the tenant
   * person list) instead of the tap doing nothing.
   */
  personSelected = output<{ localpart: string; message: MatrixMessage }>();
  imageClicked = output<{ message: MatrixMessage; group: MatrixMessage[] }>();
  reactionClicked = output<{messageId: string, emoji: string}>();
  threadClicked = output<string>();
  pollVoteClicked = output<{ pollEventId: string; answerIds: string[] }>();
  loadOlder = output<void>();

  messagesContainer = viewChild<ElementRef>('messagesContainer');

  /** eventId → decorated formatted_body, keyed by its source html (see renderFormattedBody). */
  private readonly decoratedBodies = new Map<string, { source: string; html: string }>();

  /** True while a scroll-up history load is in flight (shows the top spinner). */
  protected readonly loadingOlder = signal(false);
  /**
   * Event ids of attachments the browser could not decode, so the tile can fall back to a
   * placeholder. A `mediaUrl` is no guarantee of a usable image: MatrixMediaService returns
   * '' for a failed download but happily wraps an EMPTY 200 response in a blob URL, and a
   * 0-byte object is exactly what a stale upload leaves behind (see materializeFile). Both
   * used to render as a silent gap in the room, indistinguishable from no attachment at all.
   */
  protected readonly brokenImages = signal<ReadonlySet<string>>(new Set());
  /** Scroll height captured when loadOlder fired, to restore the viewport after prepend. */
  private prevScrollHeight = 0;

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
          if (!container) return;
          if (this.loadingOlder()) {
            // Older messages were prepended (C-5) — keep the viewport anchored on the
            // message the user was looking at instead of jumping to the bottom.
            container.scrollTop += container.scrollHeight - this.prevScrollHeight;
            this.loadingOlder.set(false);
          } else {
            container.scrollTop = container.scrollHeight;
          }
        }, 50);
      }
    });

    // If the room start was reached (or the room changed) while a load was pending,
    // no new messages may arrive to clear the spinner — clear it here.
    effect(() => {
      if (!this.hasMoreHistory()) this.loadingOlder.set(false);
    });
  }

  /** Near the top edge → ask the parent for older history (C-5 scroll-up pagination). */
  protected onContainerScroll(): void {
    if (!this.hasMoreHistory() || this.loadingOlder()) return;
    const container = this.messagesContainer()?.nativeElement;
    if (!container || container.scrollTop > 80) return;
    this.prevScrollHeight = container.scrollHeight;
    this.loadingOlder.set(true);
    this.loadOlder.emit();
  }

  isOwnMessage(message: MatrixMessage): boolean {
    return message.sender === this.currentUserId();
  }

  /**
   * Single click handler for the message bubble (the common ancestor of every
   * `[innerHTML]="item.content.formatted_body"` render site — currently just the plain
   * `m.text` case, but any future reply/edit-preview markup sharing this bubble is
   * covered too). Intercepts clicks on a `matrix.to` person-mention anchor and routes
   * them to `personSelected` (localpart + owning message) instead of letting the browser
   * navigate to matrix.to. This component has no person list, so it cannot tell whether
   * the localpart actually resolves — the message is handed along so the feature layer
   * can fall back to the normal action-sheet behaviour if it doesn't, rather than the tap
   * being swallowed. Every other anchor (room links, ordinary links pasted into a
   * message) is left untouched and falls through to the existing `messageClicked`
   * action-sheet trigger.
   */
  /** Plain-text bodies carry no markup, so urls are made clickable here. */
  protected linkify(body: string): string {
    return linkifyText(body ?? '');
  }

  /**
   * Decorated `formatted_body`: mention anchors become avatar + first-name pills.
   *
   * Memoised per event because the template re-evaluates this on every change-detection pass
   * and a fresh string would make Angular re-write `innerHTML` (and re-decode the avatar image)
   * each time. The cached entry is keyed by the source html, so an edited message re-renders.
   * A mention whose avatar is not yet in `AvatarService`'s cache renders as a text-only pill and
   * keeps that shape for the session — acceptable, the cache is populated at app start.
   */
  protected renderFormattedBody(item: MatrixMessage): string {
    const source = (item.content?.['formatted_body'] as string) ?? '';
    const cached = this.decoratedBodies.get(item.eventId);
    if (cached && cached.source === source) return cached.html;
    const html = decorateMentionPills(source, (localpart) => this.mentionAvatarUrl(localpart));
    this.decoratedBodies.set(item.eventId, { source, html });
    return html;
  }

  /**
   * Avatar thumbnail for a mentioned person. The Matrix localpart IS the `PersonModel.okey`
   * (same derivation as `MatrixChatService.personAvatarUrl`), and an uncached avatar returns
   * undefined so the pill stays text-only instead of showing a generic person icon.
   */
  private mentionAvatarUrl(localpart: string): string | undefined {
    const key = `${PersonModelName}.${localpart}`;
    return this.avatarService.getCachedStoragePath(key)
      ? this.avatarService.getAvatarUrl(key, PersonModelName, MENTION_AVATAR_SIZE)
      : undefined;
  }

  protected onBubbleClick(event: MouseEvent, item: MatrixMessage): void {
    const anchor = (event.target as HTMLElement | null)?.closest?.('a');
    const href = anchor?.getAttribute('href');
    const personKey = href ? extractMentionLocalpart(href) : undefined;
    if (personKey) {
      event.preventDefault();
      this.personSelected.emit({ localpart: personKey, message: item });
      return;
    }
    // a tapped link opens the link — not the action sheet on top of it
    if (href) return;
    this.messageClicked.emit(item);
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

  /** Mark an attachment as undecodable — the tile re-renders as the placeholder. */
  protected onImageError(eventId: string): void {
    this.brokenImages.update(prev => (prev.has(eventId) ? prev : new Set(prev).add(eventId)));
  }

  formatDate(timestamp: number): string {
    return formatMatrixDate(timestamp, this.i18n().date_today(), this.i18n().date_yesterday());
  }

  formatTime(timestamp: number): string {
    return formatMatrixTime(timestamp);
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
    const t = this.i18n();
    if (users.length === 1) return `${users[0]} ${t.isTyping()}`;
    if (users.length === 2) return `${users[0]} ${t.and()} ${users[1]} ${t.areTyping()}`;
    return `${users[0]} ${t.and()} ${users.length - 1} ${t.othersTyping()}`;
  }

  getReactions(message: MatrixMessage): { emoji: string; count: number }[] {
    if (!message.reactions) return [];
    
    return Array.from(message.reactions.entries()).map(([emoji, users]) => ({
      emoji,
      count: users.size
    }));
  }
}
