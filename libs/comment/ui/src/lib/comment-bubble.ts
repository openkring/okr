import { AsyncPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { IonAvatar, IonIcon, IonImg } from '@ionic/angular/standalone';

import { CommentModel, DocumentModel } from '@okr/shared-models';
import { FileLogoPipe, FileNamePipe, FileSizePipe, PrettyDateTimePipe } from '@okr/shared-pipes';

import { AvatarPipe } from '@okr/avatar-ui';
import { isImageMimeType } from '@okr/comment-util';

import { CommentTextPipe } from './comment-text.pipe';

/**
 * One comment, rendered as a chat bubble: avatar, author line, text, attachments.
 *
 * Bubbles stay left-aligned even for the current user's own comments — a comment thread lives
 * inside an accordion in a modal, where right-aligning would waste half the width. Ownership is
 * carried by the tint instead.
 */
@Component({
  selector: 'okr-comment-bubble',
  standalone: true,
  imports: [
    AsyncPipe, AvatarPipe, CommentTextPipe, PrettyDateTimePipe, FileLogoPipe, FileNamePipe, FileSizePipe,
    IonAvatar, IonImg, IonIcon
  ],
  styles: [`
    :host { display: block; }

    .row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    ion-avatar {
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      margin-top: 16px;
      background-color: var(--ion-color-light);
    }
    .content {
      flex: 1;
      min-width: 0;
      max-width: 560px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .author-line {
      display: flex;
      gap: 6px;
      align-items: baseline;
      padding: 0 4px;
      flex-wrap: wrap;
    }
    .author { font-size: 0.75rem; font-weight: 600; }
    .timestamp { font-size: 0.75rem; color: var(--ion-color-medium); }

    .bubble {
      background: var(--ion-color-light);
      border-radius: 12px 12px 12px 4px;
      padding: 8px 12px;
      font-size: 0.875rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .bubble.own { background: var(--ion-color-primary-tint); }
    .text { white-space: pre-wrap; }

    .images {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .image {
      width: 96px;
      height: 72px;
      object-fit: cover;
      border-radius: 8px;
      display: block;
      cursor: pointer;
    }
    .file-chip {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: var(--ion-background-color, #fff);
      border: 1px solid var(--ion-border-color, #dedede);
      border-radius: 8px;
      align-self: flex-start;
      max-width: 100%;
      cursor: pointer;
    }
    .file-chip ion-icon { font-size: 24px; flex-shrink: 0; }
    .file-meta { min-width: 0; }
    .file-name {
      font-size: 0.8125rem;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-size { font-size: 0.6875rem; color: var(--ion-color-medium); }

    @media (min-width: 768px) {
      ion-avatar { width: 32px; height: 32px; margin-top: 18px; }
      .author { font-size: 0.8125rem; }
      .bubble { font-size: 0.9375rem; padding: 9px 14px; }
      .image { width: 130px; height: 96px; }
    }
  `],
  template: `
    <div class="row">
      <ion-avatar>
        <ion-img src="{{ 'person.' + comment().authorKey | avatar:'person' }}" [alt]="comment().authorName" />
      </ion-avatar>

      <div class="content">
        <div class="author-line">
          <span class="author">{{ comment().authorName }}</span>
          <span class="timestamp">{{ comment().creationDateTime | prettyDateTime }}</span>
        </div>

        <div class="bubble" [class.own]="isOwn()">
          @if (text()) {
            <span class="text">{{ text() | commentText | async }}</span>
          }

          @if (images().length > 0) {
            <div class="images">
              @for (image of images(); track image.okey) {
                <img class="image" [src]="image.url" [alt]="image.fullPath | fileName"
                     (click)="attachmentOpened.emit(image)" />
              }
            </div>
          }

          @for (file of files(); track file.okey) {
            <div class="file-chip" (click)="attachmentOpened.emit(file)">
              <ion-icon src="{{ file.fullPath | fileLogo }}" />
              <div class="file-meta">
                <div class="file-name">{{ file.fullPath | fileName }}</div>
                <div class="file-size">{{ file.size | fileSize }}</div>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export class CommentBubble {
  public readonly comment = input.required<CommentModel>();
  /** the documents this comment references, already resolved by the store */
  public readonly attachments = input<DocumentModel[]>([]);
  /** personKey of the logged-in user — tints their own comments */
  public readonly currentPersonKey = input<string>('');

  public readonly attachmentOpened = output<DocumentModel>();

  protected readonly text = computed(() => this.comment().description ?? '');
  protected readonly isOwn = computed(() =>
    this.currentPersonKey().length > 0 && this.comment().authorKey === this.currentPersonKey());

  protected readonly images = computed(() =>
    this.attachments().filter(a => isImageMimeType(a.mimeType, a.fullPath)));
  protected readonly files = computed(() =>
    this.attachments().filter(a => !isImageMimeType(a.mimeType, a.fullPath)));
}
