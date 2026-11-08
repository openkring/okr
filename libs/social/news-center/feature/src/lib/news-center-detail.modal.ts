import { Component, computed, inject, input } from '@angular/core';

import { NewsSegment } from '@okr/shared-models';
import { NewsDetailModal } from '@okr/social-news-center-ui';
import { NewsItem } from '@okr/social-news-center-util';

import { NewsCenterStore } from './news-center.store';

/**
 * Host of `okr-news-detail-modal`, opened by `NewsCenterStore.openItem`. ModalController
 * componentProps are a one-time snapshot, so a webcam opened full size would freeze on the image
 * it was opened with. This host injects the store (passed in through the modal's `injector`) and
 * binds the camera's current item, so the open modal follows the store's `refreshMinutes` timer.
 * Not an edit modal: nothing to save, no change-confirmation.
 */
@Component({
  selector: 'okr-news-center-detail-modal',
  standalone: true,
  imports: [NewsDetailModal],
  template: `
    <okr-news-detail-modal class="ion-page" [item]="current()" [channel]="channel()" [segment]="segment()" [i18n]="store.i18n"
      [imageUrl]="imageUrl()" [capturedAt]="capturedAt()" />
  `,
})
export class NewsCenterDetailModal {
  protected readonly store = inject(NewsCenterStore);

  public readonly item = input.required<NewsItem>();
  public readonly segment = input<NewsSegment>('video');

  /** a webcam's newest image from the store; every other item as opened */
  protected readonly current = computed(() => {
    const item = this.item();
    if (this.segment() !== 'webcam') return item;
    return this.store.feeds()[item.channelKey]?.items[0] ?? item;
  });
  protected readonly channel = computed(() => this.store.allChannels().find((c) => c.okey === this.item().channelKey));
  protected readonly imageUrl = computed(() => (this.segment() === 'webcam' ? (this.current().mediaUrl ?? '') : ''));
  protected readonly capturedAt = computed(() => {
    const at = this.current().publishedAt;
    return this.segment() === 'webcam' && at ? new Date(at) : null;
  });
}
