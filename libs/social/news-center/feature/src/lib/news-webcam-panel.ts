import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonAccordion, IonItem, IonLabel } from '@ionic/angular';
import { of, switchMap } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { NewsChannelModel } from '@okr/shared-models';
import { PinchZoom } from '@okr/shared-ui';
import { NewsChannelService } from '@okr/social-news-center-data-access';
import { NewsImagePipe } from '@okr/social-news-center-ui';
import { NEWS_CENTER_I18N_KEYS, NewsCenterI18n, NewsItem } from '@okr/social-news-center-util';

import { NewsCenterService } from './news-center.service';

/**
 * The webcams an org hosts, as an accordion of the org detail view (design 2026-11-09 §5.4): each
 * camera's current still, large and pinch-zoomable, with its capture time. Loads through the same
 * path as the NewsCenter (direct or relay) and refreshes per `refreshMinutes` while mounted.
 * The org modal mounts this with a dynamic `createComponent`, so the org lib never imports it statically.
 */
@Component({
  selector: 'okr-news-webcam-panel',
  standalone: true,
  imports: [IonAccordion, IonItem, IonLabel, PinchZoom, NewsImagePipe],
  styles: [`
    .cam { padding: 8px 16px 16px; }
    .cam h3 { margin: 0 0 6px; font-size: 0.95rem; font-weight: 600; }
    .zoom { overflow: hidden; border-radius: 6px; background: var(--ion-color-light); touch-action: none; }
    .zoom img { display: block; width: 100%; height: auto; }
    .captured { padding-top: 4px; color: var(--ion-color-medium); font-size: 0.8rem; }
  `],
  template: `
    <ion-accordion toggle-icon-slot="start" value="webcam">
      <ion-item slot="header">
        <ion-label>{{ i18n.segment_webcam() }}</ion-label>
      </ion-item>
      <div slot="content">
        @for (channel of channels(); track channel.okey) {
          <div class="cam">
            <h3>{{ channel.name }}</h3>
            @if (stills()[channel.okey]; as still) {
              @if (still.mediaUrl) {
                <div class="zoom" [okrPinchZoom]="img" [resetKey]="still.mediaUrl">
                  <img #img [src]="still.mediaUrl | newsImage" alt="" referrerpolicy="no-referrer" />
                </div>
                <div class="captured">{{ captured(still) }}</div>
              } @else {
                <div class="captured">{{ i18n.image_unavailable() }}</div>
              }
            }
          </div>
        }
      </div>
    </ion-accordion>
  `,
})
export class NewsWebcamPanel {
  private readonly appStore = inject(AppStore);
  private readonly channelService = inject(NewsChannelService);
  private readonly newsService = inject(NewsCenterService);
  protected readonly i18n = inject(I18nService).translateAll(NEWS_CENTER_I18N_KEYS) as NewsCenterI18n;

  public readonly orgKey = input.required<string>();

  protected readonly channels = toSignal(
    toObservable(this.orgKey).pipe(switchMap((orgKey) => (orgKey ? this.channelService.listByOrg(this.appStore.tenantId(), orgKey) : of([] as NewsChannelModel[])))),
    { initialValue: [] as NewsChannelModel[] },
  );
  /** okey → the camera's latest still */
  protected readonly stills = signal<Record<string, NewsItem>>({});
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor() {
    effect(() => {
      const channels = this.channels();
      this.clearTimers();
      for (const channel of channels) {
        void this.load(channel);
        const everyMs = Math.max(1, channel.refreshMinutes || 5) * 60_000;
        this.timers.set(channel.okey, setInterval(() => void this.load(channel), everyMs));
      }
    });
    inject(DestroyRef).onDestroy(() => this.clearTimers());
  }

  protected captured(item: NewsItem): string {
    if (!item.publishedAt) return '';
    return new Date(item.publishedAt).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  }

  private async load(channel: NewsChannelModel): Promise<void> {
    const state = await this.newsService.loadChannel(channel, Date.now());
    const item = state.items[0] ?? { id: channel.okey, channelKey: channel.okey, title: channel.name, publishedAt: '' };
    this.stills.update((s) => ({ ...s, [channel.okey]: state.error ? { ...item, mediaUrl: '' } : item }));
  }

  private clearTimers(): void {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }
}
