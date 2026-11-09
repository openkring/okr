import { Component, computed, input, linkedSignal } from '@angular/core';
import { IonAvatar, IonIcon } from '@ionic/angular';

import { NewsChannelModel, NewsSegment } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ImgDirective } from '@okr/shared-ui';
import { NewsCenterI18n, NewsItem } from '@okr/social-news-center-util';

import { NewsImagePipe } from './news-image.pipe';

import { formatNewsDate, formatNewsDuration } from './news-date';

/**
 * One tile of the grid. The thumbnail is a plain lazy `<img>` rather than `okrImg`: the feed
 * thumbnail is an external https URL (nothing to rewrite) and a hot-link refusal must show the
 * «Bild nicht verfügbar» placeholder, whereas okrImg would swap in the generic file icon.
 */
@Component({
  selector: 'okr-news-card',
  standalone: true,
  imports: [NewsImagePipe, IonAvatar, IonIcon, SvgIconPipe, ImgDirective],
  styles: [`
    :host { display: block; }
    .card { display: block; width: 100%; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; color: inherit; font: inherit; }
    .thumb { position: relative; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 8px; background: var(--ion-color-light); }
    .thumb.square { aspect-ratio: 1 / 1; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      width: 100%; height: 100%; font-size: 0.8rem; color: var(--ion-color-medium); }
    .placeholder ion-icon { font-size: 1.6rem; }
    .duration { position: absolute; right: 6px; bottom: 6px; padding: 1px 6px; border-radius: 4px;
      background: rgba(0, 0, 0, 0.75); color: #fff; font-size: 0.75rem; }
    .meta { display: flex; gap: 8px; padding-top: 8px; }
    ion-avatar { flex: none; width: 32px; height: 32px; }
    .text { min-width: 0; }
    .title { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      font-weight: 600; line-height: 1.25; }
    .sub { color: var(--ion-color-medium); font-size: 0.8rem; }
  `],
  template: `
    <button type="button" class="card">
      <div class="thumb" [class.square]="segment() === 'audio'">
        @if (item().thumbnailUrl && !failed()) {
          <img [src]="item().thumbnailUrl | newsImage" alt="" loading="lazy" decoding="async" (error)="failed.set(true)" referrerpolicy="no-referrer" />
        } @else {
          <div class="placeholder">
            <ion-icon src="{{ 'image' | svgIcon }}" />
            <span>{{ i18n().image_unavailable() }}</span>
          </div>
        }
        @if (duration()) {
          <span class="duration">{{ duration() }}</span>
        }
      </div>
      <div class="meta">
        @if (channel()?.avatarUrl) {
          <ion-avatar><img okrImg [src]="channel()!.avatarUrl | newsImage" alt="" referrerpolicy="no-referrer" /></ion-avatar>
        }
        <div class="text">
          <div class="title">{{ item().title }}</div>
          <div class="sub">
            @if (channel(); as ch) { {{ ch.name }} }
            @if (date()) { · {{ date() }} }
          </div>
        </div>
      </div>
    </button>
  `,
})
export class NewsCard {
  public readonly item = input.required<NewsItem>();
  public readonly channel = input<NewsChannelModel>();
  public readonly segment = input<NewsSegment>('video');
  public readonly i18n = input.required<NewsCenterI18n>();

  protected readonly failed = linkedSignal<NewsItem, boolean>({ source: this.item, computation: () => false });
  protected readonly date = computed(() => formatNewsDate(this.item().publishedAt));
  protected readonly duration = computed(() => formatNewsDuration(this.item().durationSec));
}
