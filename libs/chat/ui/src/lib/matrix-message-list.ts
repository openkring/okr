import { Component, computed, DestroyRef, effect, inject, input, output, signal, viewChild, ElementRef, Signal } from '@angular/core';

import { IonIcon, IonChip, IonAvatar, IonSpinner } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { VideoCard } from '@okr/shared-ui';
import { videoDocKeyOf, videoLink } from '@okr/content-document-util';
import { MatrixMessage, MatrixReadReceipt, PersonModelName } from '@okr/shared-models';
import { AvatarService } from '@okr/avatar-data-access';
import { MatrixReadReceiptStrip } from './matrix-read-receipt-strip';
import { PollMessage } from './poll-message';
import { decorateMentionPills, extractMentionLocalpart, formatMatrixDate, formatMatrixTime, groupMessages, ImageBatchGroup, isVideoMessage, linkifyText, readBookmark, isTrustedBookmarkEntry, ChatBookmark, parseMatrixPermalink, MatrixChatI18n, MessageOrBatch } from '@okr/chat-util';

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
    MatrixReadReceiptStrip,
    VideoCard
],
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;      /* required so flex child can shrink below content size */
      overflow: hidden;
      position: relative; /* anchors the «Zum neusten» button */
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

    /* A tap retries the download (MatrixChatStore.retryMedia). */
    button.image-batch-thumb.image-broken {
      cursor: pointer;
      font: inherit;
    }

    .image-batch-thumb.image-broken .image-retry {
      text-decoration: underline;
    }

    /* Still downloading — must NOT look like the error tile above. Before this state existed
       every new photo read "image unavailable" until its download finished, and on a phone
       that was long enough to be reported as broken. */
    .image-batch-thumb.image-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: default;
      background: var(--ion-color-light);
    }

    .image-batch-thumb.image-loading ion-spinner {
      width: 20px;
      height: 20px;
      color: var(--ion-color-medium);
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

    .media-fallback-note {
      margin: 6px 0 0;
      font-size: 0.8rem;
      opacity: 0.75;
    }

    /* Album video card (spec 1.82): a bit larger than the 72px photo thumbs, far smaller than the
       old inline player. Without an explicit width the card shrinks to its play badge in the bubble. */
    .chat-video-card {
      width: 240px;
      max-width: 100%;
    }

    /* Bookmark entry in the notes room: header (room · date), sender, 2-line snippet. */
    .bookmark-card {
      display: block;
      width: 260px;
      max-width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      border-radius: 8px;
      border-left: 3px solid var(--ion-color-primary);
      background: var(--ion-color-light);
      color: var(--ion-color-dark);
      cursor: pointer;
    }
    .bookmark-card-header {
      font-size: 0.75rem;
      color: var(--ion-color-medium);
    }
    .bookmark-card-sender {
      font-size: 0.85rem;
      font-weight: 600;
      margin-top: 2px;
    }
    .bookmark-card-snippet {
      margin: 2px 0 0;
      font-size: 0.9rem;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .bookmark-card-reminder {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      font-size: 0.75rem;
      color: var(--ion-color-primary);
    }

    .message-video {
      max-width: 100%;
      /* Cap the height so a portrait phone clip cannot fill the whole timeline. */
      max-height: 420px;
      border-radius: 8px;
      display: block;
      background: #000;
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

    .unread-divider {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0;
      color: var(--ion-color-danger);
      font-size: 0.75rem;
      font-weight: 600;
    }

    .unread-divider::before,
    .unread-divider::after {
      content: '';
      flex: 1;
      border-top: 1px solid var(--ion-color-danger);
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

    /* Jump target (spec 1.104 §4.4): briefly outlined after the list scrolled to it. */
    .message-bubble.jump-highlight {
      box-shadow: 0 0 0 3px var(--ion-color-warning, #ffc409);
      transition: box-shadow 0.3s ease-in;
    }

    .latest-button {
      position: absolute;
      right: 16px;
      bottom: 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: none;
      border-radius: 16px;
      background: var(--ion-color-primary, #3880ff);
      color: var(--ion-color-primary-contrast, #fff);
      font-size: 0.85rem;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
      cursor: pointer;
    }

    .latest-count {
      min-width: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: var(--ion-color-primary-contrast, #fff);
      color: var(--ion-color-primary, #3880ff);
      font-weight: 600;
      font-size: 0.75rem;
      line-height: 18px;
      text-align: center;
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
            @if (hasUnreadDivider(item)) {
              <div class="unread-divider" role="separator"><span>{{ i18n().unread_divider() }}</span></div>
            }
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
                  <div class="message-bubble"
                       [attr.data-event-ids]="batchEventIds(item)"
                       [class.jump-highlight]="isBatchHighlighted(item)">
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
                        } @else if (failedMediaIds().has(msg.eventId) || brokenImages().has(msg.eventId)) {
                          <button type="button" class="image-batch-thumb image-broken" [title]="msg.body"
                                  [attr.aria-label]="i18n().image_unavailable() + '. ' + i18n().image_retry()"
                                  (click)="onRetryImage(msg.eventId); $event.stopPropagation()">
                            <ion-icon src="{{ 'alert-circle' | svgIcon }}" />
                            <span>{{ i18n().image_unavailable() }}</span>
                            <span class="image-retry">{{ i18n().image_retry() }}</span>
                          </button>
                        } @else {
                          <div class="image-batch-thumb image-loading" [title]="msg.body" [attr.aria-label]="i18n().image_loading()" role="status">
                            <ion-spinner name="crescent" />
                          </div>
                        }
                      }
                    </div>
                  </div>
                  <div class="message-timestamp">
                    {{ item.messages.length > 1 ? item.messages.length + ' ' + i18n().images() + ' · ' : '' }}{{ formatTime(item.timestamp) }}
                  </div>
                  @if (receiptsByEventId().get(item.messages[0].eventId); as receipts) {
                    <okr-matrix-read-receipt-strip [receipts]="receipts" [reactions]="item.messages[0].reactions" [knownUsers]="knownUsers()" [currentUserId]="currentUserId()" />
                  }
                </div>
              </div>
            } @else {
              @if (item.type === 'm.notice') {
                <div class="notice-row">
                  <div class="notice-bubble" [attr.data-event-ids]="item.eventId">{{ item.body }} · {{ formatTime(item.timestamp) }}</div>
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
                      [attr.data-event-ids]="item.eventId"
                      [class.jump-highlight]="highlighted() === item.eventId"
                      [class.edited]="item.isEdited"
                      [class.redacted]="item.isRedacted"
                      (click)="onBubbleClick($event, item)"
                    >
                      @if (item.isRedacted) {
                        <p class="message-text">Message deleted</p>
                      } @else {
                        @switch (item.type) {
                          @case ('m.text') {
                            @let videoKey = videoKeyOf(item);
                            @let bookmark = bookmarkOf(item);
                            @if (bookmark) {
                              <!-- Bookmark entry (spec 1.104): a tap opens the original, not the action sheet. -->
                              <div class="bookmark-card" role="button" tabindex="0"
                                (click)="onBookmarkCardClick($event, bookmark)"
                                (keydown.enter)="onBookmarkCardClick($event, bookmark)">
                                <div class="bookmark-card-header">{{ bookmark.roomName }} · {{ formatDate(bookmark.originTs) }}</div>
                                <div class="bookmark-card-sender">{{ bookmark.senderName }}</div>
                                <p class="bookmark-card-snippet">{{ bookmark.snippet }}</p>
                                @let due = reminders()?.get(item.eventId);
                                @if (due) {
                                  <div class="bookmark-card-reminder">
                                    <ion-icon src="{{ 'alarm' | svgIcon }}" />
                                    {{ formatDate(due) }} {{ formatTime(due) }}
                                  </div>
                                }
                              </div>
                            } @else if (videoKey) {
                              <!-- An album video (spec 1.82 §8): a poster card instead of the bare link.
                                   VideoCard stops only the poster tap; the title, a loading or an
                                   unavailable card let the tap through to the bubble's action sheet. -->
                              @let card = videoCards()[videoKey];
                              <okr-video-card class="chat-video-card"
                                [posterUrl]="card?.posterUrl ?? ''"
                                [available]="card?.available ?? false"
                                [loading]="card?.loading ?? true"
                                [title]="i18n().video_card_title()"
                                [unavailableLabel]="videoUnavailableLabel()"
                                (clicked)="videoCardClicked.emit(videoKey)"
                              />
                              @if (!isCanonicalVideoBody(item, videoKey)) {
                                <!-- A field-carrying message with any other body: show the text too,
                                     so a forged org.okr.video field can never hide what was written. -->
                                <p class="message-text" [innerHTML]="linkify(item.body)"></p>
                              }
                            } @else if (item.content.formatted_body) {
                              <p class="message-text" [innerHTML]="renderFormattedBody(item)"></p>
                            } @else {
                              <p class="message-text" [innerHTML]="linkify(item.body)"></p>
                            }
                          }
                          @case ('m.video') {
                            @if (showVideoPlayer(item)) {
                              <video
                                controls
                                preload="metadata"
                                playsinline
                                class="message-video"
                                [src]="item.mediaUrl"
                                [poster]="item.posterUrl ?? null"
                                (error)="onVideoError(item.eventId)"
                                (click)="$event.stopPropagation()"
                              ></video>
                            } @else {
                              <div class="message-file">
                                <ion-icon src="{{'video' | svgIcon}}"></ion-icon>
                                <span>{{ item.body }}</span>
                              </div>
                              <p class="media-fallback-note">{{ i18n().video_notPlayable() }}</p>
                            }
                          }
                          @case ('m.file') {
                            <!-- Videos this app sent before it knew about m.video arrived as
                                 m.file with a video mimetype. Route them to the same player
                                 rather than leaving them as document cards forever. -->
                            @if (showVideoPlayer(item)) {
                              <video
                                controls
                                preload="metadata"
                                playsinline
                                class="message-video"
                                [src]="item.mediaUrl"
                                [poster]="item.posterUrl ?? null"
                                (error)="onVideoError(item.eventId)"
                                (click)="$event.stopPropagation()"
                              ></video>
                            } @else if (isAudioFile(item) && item.mediaUrl) {
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
                      <okr-matrix-read-receipt-strip [receipts]="receipts" [reactions]="item.reactions" [knownUsers]="knownUsers()" [currentUserId]="currentUserId()" />
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
    @if (isJumped()) {
      <button type="button" class="latest-button" (click)="onLatestClick()">
        <ion-icon src="{{ 'arrow-down' | svgIcon }}" aria-hidden="true" />
        <span>{{ i18n().jump_latest() }}</span>
        @if (newMessagesCount() > 0) {
          <span class="latest-count">{{ newMessagesCount() }}</span>
        }
      </button>
    }
  `
})
export class MatrixMessageList {
  private readonly avatarService = inject(AvatarService);

  // inputs
  messages = input.required<MatrixMessage[]>();
  /** App origins a video link may carry (AppStore.appLinkOrigins) — never a raw location.origin (native: capacitor://). */
  linkOrigins = input<string[]>([]);
  currentUserId = input<string>();
  /** C-5: whether older history may still be loaded by scrolling to the top. */
  hasMoreHistory = input<boolean>(false);
  typingUsers = input<string[]>([]);
  threadReplyCounts = input<Map<string, number>>(new Map());
  receiptsByEventId = input<Map<string, MatrixReadReceipt[]>>(new Map());
  /** every room member with a read marker, by user id — names the reactors in the receipt popover */
  protected readonly knownUsers = computed(() => {
    const users = new Map<string, MatrixReadReceipt>();
    for (const receipts of this.receiptsByEventId().values()) {
      for (const r of receipts) users.set(r.userId, r);
    }
    return users;
  });
  /** Attachments whose download failed; any other image without a mediaUrl is still loading. */
  failedMediaIds = input<ReadonlySet<string>>(new Set());
  public readonly i18n = input.required<MatrixChatI18n>();
  /** Signed posters of the album videos linked in this list, by docKey — owned by the feature (VideoUrlService). */
  public readonly videoCards = input<Record<string, { posterUrl: string; available: boolean; loading: boolean }>>({});
  public readonly videoUnavailableLabel = input('');


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
  /** A tap on a failed image tile: download it again. */
  mediaRetry = output<string>();
  reactionClicked = output<{messageId: string, emoji: string}>();
  threadClicked = output<string>();
  pollVoteClicked = output<{ pollEventId: string; answerIds: string[] }>();
  loadOlder = output<void>();
  /** A tap on an album video card: the docKey to play. */
  public readonly videoCardClicked = output<string>();
  public readonly bookmarkClicked = output<ChatBookmark>();
  /** A matrix.to link to a room or message on our homeserver was tapped. */
  public readonly permalinkClicked = output<{ roomIdOrAlias: string; eventId?: string }>();
  /** Our homeserver name; matrix.to links are only opened in-app when they point here. */
  public readonly serverName = input<string>('');
  /** True in the user's own notes room: only there are bookmark entries rendered as cards. */
  public readonly isNotesRoom = input(false);
  /** Pending reminders in the notes room: entry event id → due time (epoch ms); shown as a bell on the card. */
  public readonly reminders = input<Map<string, number>>();
  /** The message a jump landed on: scrolled to the centre and highlighted for two seconds. */
  public readonly highlightEventId = input<string>();
  /** «Ab hier ungelesen» (spec 1.104 §6.2): the divider is drawn above this message. */
  public readonly unreadDividerEventId = input<string>();
  /** True while the list shows a jumped (non-live) timeline: no follow-to-bottom, «Zum neusten» shown. */
  public readonly isJumped = input<boolean>(false);
  /** New messages that arrived while jumped — the count on «Zum neusten». */
  public readonly newMessagesCount = input<number>(0);
  /** Scrolled near the bottom of a jumped timeline: ask for newer messages. */
  public readonly loadNewer = output<void>();
  /** «Zum neusten» was tapped: return to the live end of the room. */
  public readonly latestClicked = output<void>();

  messagesContainer = viewChild<ElementRef>('messagesContainer');

  /** eventId → decorated formatted_body, keyed by its source html (see renderFormattedBody). */
  private readonly decoratedBodies = new Map<string, { source: string; html: string }>();

  /** True while a scroll-up history load is in flight (shows the top spinner). */
  protected readonly loadingOlder = signal(false);
  /** The bubble currently outlined as jump target. */
  protected readonly highlighted = signal<string | undefined>(undefined);
  /** A jump target still to scroll to — it may only render with a later emission of the list. */
  private pendingHighlight: string | undefined;
  private highlightTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * True from a `loadNewer` until the list grew at the end. Newer messages land BELOW the
   * viewport and must not move it — also not when the jumped timeline reached the live end and
   * the list switched to live, which is the same list continued.
   */
  private loadingNewer = false;
  private loadingNewerTimer: ReturnType<typeof setTimeout> | undefined;
  /** «Zum neusten» was tapped: the next list (the live one) goes to the bottom. */
  private followLatest = false;
  /**
   * Event ids of attachments the browser could not decode, so the tile can fall back to a
   * placeholder. A `mediaUrl` is no guarantee of a usable image: MatrixMediaService returns
   * '' for a failed download but happily wraps an EMPTY 200 response in a blob URL, and a
   * 0-byte object is exactly what a stale upload leaves behind (see materializeFile). Both
   * used to render as a silent gap in the room, indistinguishable from no attachment at all.
   */
  protected readonly brokenImages = signal<ReadonlySet<string>>(new Set());
  /**
   * Event ids of videos the browser refused to play. Separate from brokenImages because the
   * cause is usually different and not a defect: an iPhone records HEVC in a .mov container,
   * which Chrome and Firefox cannot decode at all. Without this the bubble keeps a player
   * that is permanently black at 0:00 — worse than no player, because it hides the fact that
   * the file is there and can simply be downloaded.
   */
  protected readonly unplayableVideos = signal<ReadonlySet<string>>(new Set());
  /** Scroll height captured when loadOlder fired, to restore the viewport after prepend. */
  private prevScrollHeight = 0;
  /**
   * Event id of the last rendered message, to tell an APPEND from an in-place PATCH.
   *
   * The message list is re-emitted as a fresh array for both, but only one of them should
   * move the viewport. A poll vote, a reaction or an edit rewrites one entry and leaves the
   * tail alone — re-anchoring to the bottom then throws the reader out of the very message
   * they are interacting with (voting in a poll halfway up the room jumped to the newest
   * message). A prepend of older history keeps the tail too, and is anchored separately.
   */
  private lastTailEventId = '';

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
        const tail = msgs[msgs.length - 1].eventId;
        setTimeout(() => {
          const container = this.messagesContainer()?.nativeElement;
          if (!container) return;
          if (this.loadingOlder()) {
            // Older messages were prepended (C-5) — keep the viewport anchored on the
            // message the user was looking at instead of jumping to the bottom.
            container.scrollTop += container.scrollHeight - this.prevScrollHeight;
            this.loadingOlder.set(false);
          } else if (this.pendingHighlight && this.scrollToHighlight(container, this.pendingHighlight)) {
            // A jump landed (spec 1.104 §4.4): the target is centred instead of the newest message.
          } else if (tail !== this.lastTailEventId) {
            if (this.followLatest || (!this.isJumped() && !this.loadingNewer)) {
              // A genuinely new message at the end — follow it down, as before.
              container.scrollTop = container.scrollHeight;
            }
            // else: newer history of a jumped timeline was appended below — stay put.
            this.followLatest = false;
            this.setLoadingNewer(false);
          }
          this.lastTailEventId = tail;
          this.autoLoadOlderWhenNotScrollable(container);
          if (this.isJumped()) {
            // Any emission ends a forward page — also a short one that left the tail alone.
            // Re-check right away so a page too short to scroll cannot stall the way down.
            this.setLoadingNewer(false);
            this.autoLoadNewerWhenNeeded(container);
          }
        }, 50);
      }
    });

    // A new jump target: scroll to it as soon as its bubble is rendered (now, or with the
    // emission of the jumped timeline that is still on its way).
    effect(() => {
      const target = this.highlightEventId();
      this.pendingHighlight = target;
      if (!target) return;
      setTimeout(() => {
        const container = this.messagesContainer()?.nativeElement;
        if (container && this.pendingHighlight === target) this.scrollToHighlight(container, target);
      }, 50);
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.highlightTimer);
      clearTimeout(this.loadingNewerTimer);
    });

    // If the room start was reached (or the room changed) while a load was pending,
    // no new messages may arrive to clear the spinner — clear it here.
    effect(() => {
      if (!this.hasMoreHistory()) this.loadingOlder.set(false);
    });
  }

  /**
   * Near the top edge → ask the parent for older history (C-5 scroll-up pagination).
   * Near the bottom of a jumped timeline → ask for newer messages (spec 1.104 §4.4).
   */
  protected onContainerScroll(): void {
    const container = this.messagesContainer()?.nativeElement;
    if (!container) return;
    if (this.autoLoadNewerWhenNeeded(container)) return;
    if (!this.hasMoreHistory() || this.loadingOlder()) return;
    if (container.scrollTop > 80) return;
    this.requestOlder(container);
  }

  protected onLatestClick(): void {
    this.followLatest = true;
    this.pendingHighlight = undefined;
    this.setLoadingNewer(false);
    this.latestClicked.emit();
  }

  /**
   * Set the loadNewer guard. It is released when the list grows at the end; a pagination that
   * brings nothing new emits no list, so the guard also releases itself after a few seconds.
   */
  private setLoadingNewer(on: boolean): void {
    this.loadingNewer = on;
    clearTimeout(this.loadingNewerTimer);
    if (on) this.loadingNewerTimer = setTimeout(() => {
      this.loadingNewer = false;
      const container = this.messagesContainer()?.nativeElement;
      if (container) this.autoLoadNewerWhenNeeded(container);
    }, 5000);
  }

  /**
   * In a jumped timeline: ask for newer messages when the viewport is at (or near) the bottom,
   * or does not scroll at all — the mirror of autoLoadOlderWhenNotScrollable. Returns true
   * when it asked.
   */
  private autoLoadNewerWhenNeeded(container: HTMLElement): boolean {
    if (!this.isJumped() || this.loadingNewer || this.loadingOlder()) return false;
    const notScrollable = container.scrollHeight <= container.clientHeight + 80;
    const nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 80;
    if (!notScrollable && !nearBottom) return false;
    this.setLoadingNewer(true);
    this.loadNewer.emit();
    return true;
  }

  /**
   * Centre the jump target's bubble and outline it for two seconds. False while the bubble is
   * not rendered yet (the jumped timeline has not arrived), so the next emission tries again.
   */
  private scrollToHighlight(container: HTMLElement, eventId: string): boolean {
    const bubble = Array.from(container.querySelectorAll<HTMLElement>('[data-event-ids]'))
      .find(el => (el.dataset['eventIds'] ?? '').split(' ').includes(eventId));
    if (!bubble) return false;
    this.pendingHighlight = undefined;
    bubble.scrollIntoView({ block: 'center' });
    this.highlighted.set(eventId);
    clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => this.highlighted.set(undefined), 2000);
    return true;
  }

  /** Event ids of an image batch, space-separated, for the jump target lookup. */
  protected batchEventIds(item: ImageBatchGroup): string {
    return item.messages.map(m => m.eventId).join(' ');
  }

  protected isBatchHighlighted(item: ImageBatchGroup): boolean {
    const id = this.highlighted();
    return !!id && item.messages.some(m => m.eventId === id);
  }

  /**
   * Scrolling up is the ONLY way to reach older history, and a container that does not
   * overflow never fires a scroll event — so a room that rendered too few bubbles to fill
   * the viewport is unreachable: no gesture can trigger the load, and there is no button.
   * That is not a corner case. `MatrixMessageService` counts RENDERABLE events, so a room
   * whose recent window is dominated by invisible events (the Instruktoren room: 33
   * consecutive poll votes behind two messages) legitimately renders a near-empty list.
   *
   * So whenever the rendered history is shorter than the viewport and history remains, ask
   * for more directly. This terminates: each load emits a new list, which re-runs this
   * effect, until either the viewport overflows or `hasMoreHistory` goes false at the start
   * of the room.
   */
  private autoLoadOlderWhenNotScrollable(container: HTMLElement): void {
    if (!this.hasMoreHistory() || this.loadingOlder()) return;
    if (container.scrollHeight > container.clientHeight + 80) return;
    this.requestOlder(container);
  }

  /** Emit `loadOlder`, remembering the scroll height so the viewport can be re-anchored. */
  private requestOlder(container: HTMLElement): void {
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
  /** The album video a text message points at (the org.okr.video field, else a bare link on an app origin). */
  protected videoKeyOf(item: MatrixMessage): string | undefined {
    return videoDocKeyOf(item.content, item.body ?? '', this.linkOrigins());
  }

  /** True when the body is exactly the canonical link of this video — the only text a card may replace. */
  protected isCanonicalVideoBody(item: MatrixMessage, docKey: string): boolean {
    const body = (item.body ?? '').trim();
    return this.linkOrigins().some(origin => body === videoLink(origin, docKey));
  }

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

  protected bookmarkOf(item: MatrixMessage): ChatBookmark | undefined {
    return isTrustedBookmarkEntry(this.isNotesRoom(), item.sender, this.currentUserId()) ? readBookmark(item.content) : undefined;
  }

  protected onBookmarkCardClick(event: Event, bookmark: ChatBookmark): void {
    event.stopPropagation();
    this.bookmarkClicked.emit(bookmark);
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
    const permalink = href && this.serverName() ? parseMatrixPermalink(href, this.serverName()) : undefined;
    if (permalink) {
      event.preventDefault();
      this.permalinkClicked.emit(permalink);
      return;
    }
    // a tapped link opens the link — not the action sheet on top of it
    if (href) return;
    this.messageClicked.emit(item);
  }

  /** Whether the «Ab hier ungelesen» divider goes above this item (a message, or a batch holding it). */
  protected hasUnreadDivider(item: MessageOrBatch): boolean {
    const id = this.unreadDividerEventId();
    if (!id) return false;
    return this.isBatch(item) ? item.messages.some(m => m.eventId === id) : item.eventId === id;
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

  /**
   * True while this message should render as a playable video: it is one, its media has been
   * resolved, and the browser has not already told us it cannot play it.
   */
  protected showVideoPlayer(message: MatrixMessage): boolean {
    return isVideoMessage(message)
      && !!message.mediaUrl
      && !this.unplayableVideos().has(message.eventId);
  }

  /** Mark a video as unplayable — the bubble falls back to the file card with share/download. */
  protected onVideoError(eventId: string): void {
    this.unplayableVideos.update(prev => (prev.has(eventId) ? prev : new Set(prev).add(eventId)));
  }

  /** Mark an attachment as undecodable — the tile re-renders as the placeholder. */
  protected onImageError(eventId: string): void {
    this.brokenImages.update(prev => (prev.has(eventId) ? prev : new Set(prev).add(eventId)));
  }

  /** Forget the decode failure and ask for a fresh download; the tile shows "loading" meanwhile. */
  protected onRetryImage(eventId: string): void {
    this.brokenImages.update(prev => {
      if (!prev.has(eventId)) return prev;
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
    this.mediaRetry.emit(eventId);
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
