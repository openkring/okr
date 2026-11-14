import { Component, computed, input, model, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import { CommentComposer } from '@okr/comment-ui';
import { CommentListI18n } from '@okr/comment-util';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';
import { JournalI18n } from '@okr/travel-journal-util';

/** One comment as the journal shows it — from the iPad's log or from the guest view. */
export interface JournalCommentItem { key: string; authorName: string; text: string; createdAt: string; mine: boolean }

/**
 * The comments of a section or image (spec 1.154 §7, plan decision 7): folded behind «💬 n Kommentare», unfolded
 * the list (name, time, text, «Löschen» on one's own) and the comment composer. The journal draws its own small
 * list instead of `okr-comment-bubble`, whose avatar needs the app's Firestore services (absent on the guest page,
 * unreliable offline). Presentational — the host writes and deletes.
 */
@Component({
  selector: 'okr-journal-comments',
  standalone: true,
  imports: [IonButton, IonIcon, SvgIconPipe, CommentComposer],
  styles: [`
    :host { display: block; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .head h4 { margin: 8px 0; font-size: 0.95rem; font-weight: 600; }
    .toggle { background: none; border: none; padding: 6px 0; font: inherit; font-size: 0.9rem; color: var(--ion-color-medium); cursor: pointer; }
    .toggle:hover { text-decoration: underline; }
    .comment { padding: 8px 0; border-bottom: 1px solid var(--ion-color-light); }
    .comment .meta { font-size: 0.8rem; color: var(--ion-color-medium); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .comment p { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    okr-comment-composer { margin-top: 8px; }
  `],
  template: `
    @if (title()) {
      <div class="head">
        <h4>{{ title() }}</h4>
        <ion-button fill="clear" size="small" color="medium" [attr.aria-label]="i18n().comments_close()" (click)="closed.emit()">
          <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
        </ion-button>
      </div>
    } @else if (comments().length > 0 || canWrite()) {
      <button type="button" class="toggle" [attr.aria-expanded]="expanded()" (click)="expanded.set(!expanded())">💬 {{ label() }}</button>
    }
    @if (expanded() || title()) {
      @for (comment of comments(); track comment.key) {
        <div class="comment">
          <div class="meta">
            <span>{{ comment.authorName }} · {{ when(comment.createdAt) }}</span>
            @if (comment.mine && canWrite()) {
              <ion-button size="small" fill="clear" color="medium" (click)="deleteClicked.emit(comment.key)">{{ i18n().comment_delete() }}</ion-button>
            }
          </div>
          <p>{{ comment.text }}</p>
        </div>
      }
      @if (canWrite()) {
        <okr-comment-composer [i18n]="commentI18n()" [isBusy]="busy()" [canAttach]="false" (sent)="sent.emit($event)" />
      }
    }
  `,
})
export class JournalComments {
  public readonly comments = input<JournalCommentItem[]>([]);
  public readonly i18n = input.required<JournalI18n>();
  public readonly commentI18n = input.required<CommentListI18n>();
  /** false shows the comments without composer and «Löschen» */
  public readonly canWrite = input(true);
  /** true while a comment is being sent; blocks a second send */
  public readonly busy = input(false);
  /** unfolded; the host may open it (e.g. after «Kommentieren») */
  public readonly expanded = model(false);
  /** set: always unfolded, with this heading and a close button (the comments of one image) */
  public readonly title = input('');
  public readonly sent = output<string>();
  public readonly deleteClicked = output<string>();
  public readonly closed = output<void>();

  protected readonly label = computed(() => {
    const count = this.comments().length;
    if (count === 0) return this.i18n().comment_write();
    return count === 1 ? this.i18n().comments_one() : fill(this.i18n().comments_count(), { count });
  });

  /** ISO time → `14.01.2027 09:30` in the device's time zone. */
  protected when(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const two = (n: number) => String(n).padStart(2, '0');
    return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
  }
}
