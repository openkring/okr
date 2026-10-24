import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';
import { JournalI18n } from '@okr/travel-journal-util';

/** One comment as the reactions block shows it — from the iPad's log or from the guest view. */
export interface ReactionComment { key: string; authorName: string; text: string; createdAt: string; mine: boolean }

/**
 * Likes and comments at the end of a footprint (spec 1.113 §9.2, plan 7), for authors on the iPad and for
 * guests in the browser alike. Presentational: the parent toggles the like, asks for the text and deletes.
 */
@Component({
  selector: 'okr-journal-reactions',
  standalone: true,
  imports: [IonButton, IonIcon, SvgIconPipe],
  styles: [`
    :host { display: block; max-width: 760px; margin: 24px auto 32px; padding: 0 16px; }
    .likes { display: flex; align-items: center; gap: 8px; }
    .likes span { color: var(--ion-color-medium); font-size: 0.9rem; }
    h3 { font-size: 1rem; margin: 20px 0 8px; }
    .comment { padding: 8px 0; border-bottom: 1px solid var(--ion-color-light); }
    .comment .meta { font-size: 0.8rem; color: var(--ion-color-medium); display: flex; justify-content: space-between; align-items: center; }
    .comment p { margin: 4px 0 0; white-space: pre-wrap; }
    .empty { color: var(--ion-color-medium); }
  `],
  template: `
    <div class="likes">
      <ion-button fill="clear" (click)="likeToggled.emit()" [attr.aria-pressed]="liked()" [attr.aria-label]="i18n().like()">
        <ion-icon slot="icon-only" [color]="liked() ? 'danger' : 'medium'" src="{{ (liked() ? 'heart' : 'heart-outline') | svgIcon }}" />
      </ion-button>
      <span>{{ likesText() }}</span>
    </div>
    <h3>{{ i18n().comments_title() }}</h3>
    @for (comment of comments(); track comment.key) {
      <div class="comment">
        <div class="meta">
          <span>{{ comment.authorName }} · {{ when(comment.createdAt) }}</span>
          @if (comment.mine) {
            <ion-button size="small" fill="clear" color="medium" (click)="deleteClicked.emit(comment.key)">{{ i18n().comment_delete() }}</ion-button>
          }
        </div>
        <p>{{ comment.text }}</p>
      </div>
    } @empty {
      <p class="empty">{{ i18n().comments_empty() }}</p>
    }
    <ion-button fill="outline" size="small" (click)="writeClicked.emit()">
      <ion-icon slot="start" src="{{ 'chatbubble' | svgIcon }}" />{{ i18n().comment_write() }}
    </ion-button>
  `,
})
export class JournalReactions {
  public readonly likes = input(0);
  public readonly liked = input(false);
  public readonly comments = input<ReactionComment[]>([]);
  public readonly i18n = input.required<JournalI18n>();
  public readonly likeToggled = output<void>();
  public readonly writeClicked = output<void>();
  public readonly deleteClicked = output<string>();

  protected readonly likesText = computed(() => {
    const count = this.likes();
    return count === 0 ? '' : fill(this.i18n().likes_count(), { count });
  });

  /** ISO time → `14.01.2027 09:30` in the device's time zone. */
  protected when(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const two = (n: number) => String(n).padStart(2, '0');
    return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
  }
}
