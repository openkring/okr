import { Component, input, output } from '@angular/core';

import { CommentModel, DocumentModel } from '@okr/shared-models';
import { EmptyList } from '@okr/shared-ui';

import { CommentBubble } from './comment-bubble';

/**
 * The comment thread: a stack of bubbles, oldest at the top.
 *
 * Replaces the former 4/8-column grid of `<small>` text, which needed a separate narrow-screen
 * variant to stay readable and still dropped the author on small screens.
 */
@Component({
  selector: 'okr-comments-list',
  standalone: true,
  imports: [
    EmptyList, CommentBubble
  ],
  styles: [`
    .thread {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
  `],
  template: `
    @if (comments().length === 0) {
      <okr-empty-list [message]="empty()" />
    } @else {
      <div class="thread">
        @for (comment of comments(); track comment.okey) {
          <okr-comment-bubble
            [comment]="comment"
            [attachments]="attachmentsOf(comment)"
            [currentPersonKey]="currentPersonKey()"
            (attachmentOpened)="attachmentOpened.emit($event)" />
        }
      </div>
    }
  `
})
export class CommentsList {
  public comments = input.required<CommentModel[]>();
  public empty = input.required<string>();
  /** okey -> document, for every attachment referenced by any of the comments */
  public attachments = input<Map<string, DocumentModel>>(new Map());
  public currentPersonKey = input<string>('');

  public attachmentOpened = output<DocumentModel>();

  /**
   * Comments written before `attachmentKeys` existed read back without the field — Firestore
   * returns the stored document, not an instance of the model class, so its defaults never run.
   */
  protected attachmentsOf(comment: CommentModel): DocumentModel[] {
    const keys = comment.attachmentKeys ?? [];
    if (keys.length === 0) return [];
    const resolved = this.attachments();
    return keys.map(key => resolved.get(key)).filter((doc): doc is DocumentModel => !!doc);
  }
}
