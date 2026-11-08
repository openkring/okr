import { Component, computed, input, linkedSignal } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import { NewsChannelModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { NewsCenterI18n, NewsItem } from '@okr/social-news-center-util';

import { formatNewsDate, isHttpUrl } from './news-date';

/** Article teaser: image, plain-text summary (interpolation only, never innerHTML) and a link to the original. */
@Component({
  selector: 'okr-news-text-view',
  standalone: true,
  imports: [IonButton, IonIcon, SvgIconPipe],
  styles: [`
    :host { display: block; }
    img { display: block; width: 100%; max-height: 360px; object-fit: cover; }
    .body { padding: 16px; }
    h2 { margin: 0 0 4px; font-size: 1.2rem; }
    .sub { color: var(--ion-color-medium); font-size: 0.85rem; }
    .summary { margin: 12px 0; white-space: pre-line; }
  `],
  template: `
    @if (item().thumbnailUrl && !imageFailed()) {
      <img [src]="item().thumbnailUrl" alt="" loading="lazy" (error)="imageFailed.set(true)" />
    }
    <div class="body">
      <h2>{{ item().title }}</h2>
      <div class="sub">
        @if (channel(); as ch) { {{ ch.name }} }
        @if (date()) { · {{ date() }} }
      </div>
      @if (item().summary) {
        <p class="summary">{{ item().summary }}</p>
      }
      @if (articleUrl(); as url) {
        <ion-button [href]="url" target="_blank" rel="noopener noreferrer">
          {{ i18n().read_article() }}
          <ion-icon slot="end" src="{{ 'arrow-forward' | svgIcon }}" />
        </ion-button>
      }
    </div>
  `,
})
export class NewsTextView {
  public readonly item = input.required<NewsItem>();
  public readonly channel = input<NewsChannelModel>();
  public readonly i18n = input.required<NewsCenterI18n>();

  protected readonly imageFailed = linkedSignal<NewsItem, boolean>({ source: this.item, computation: () => false });
  protected readonly articleUrl = computed(() => (isHttpUrl(this.item().link) ? this.item().link : ''));
  protected readonly date = computed(() => formatNewsDate(this.item().publishedAt));
}
