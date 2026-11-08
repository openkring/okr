import { Component, computed, input, output } from '@angular/core';
import { IonSpinner } from '@ionic/angular';

import { NewsChannelModel, NewsSegment } from '@okr/shared-models';
import { NewsCenterI18n, NewsItem } from '@okr/social-news-center-util';

import { NewsCard } from './news-card';

/** Responsive card grid: 1 column, 2 from 576 px, 3 from 992 px, 4 from 1200 px. */
@Component({
  selector: 'okr-news-grid',
  standalone: true,
  imports: [NewsCard, IonSpinner],
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(1, 1fr); gap: 16px; padding: 16px; }
    @media (min-width: 576px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 992px) { .grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 1200px) { .grid { grid-template-columns: repeat(4, 1fr); } }
    .state { display: flex; justify-content: center; padding: 32px 16px; color: var(--ion-color-medium); }
  `],
  template: `
    @if (items().length > 0) {
      <div class="grid">
        @for (item of items(); track item.channelKey + '/' + item.id) {
          <okr-news-card
            [item]="item" [channel]="channelOf(item)" [segment]="segment()" [i18n]="i18n()"
            (click)="opened.emit(item)" />
        }
      </div>
    }
    @if (loading()) {
      <div class="state"><ion-spinner name="dots" /></div>
    } @else if (items().length === 0) {
      <div class="state">{{ i18n().empty() }}</div>
    }
  `,
})
export class NewsGrid {
  public readonly items = input.required<NewsItem[]>();
  public readonly channels = input.required<NewsChannelModel[]>();
  public readonly segment = input<NewsSegment>('video');
  public readonly loading = input(false);
  public readonly i18n = input.required<NewsCenterI18n>();

  public readonly opened = output<NewsItem>();

  private readonly channelByKey = computed(() => new Map(this.channels().map(c => [c.okey, c])));

  protected channelOf(item: NewsItem): NewsChannelModel | undefined {
    return this.channelByKey().get(item.channelKey);
  }
}
