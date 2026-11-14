import { Component, input } from '@angular/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';

import { NewsChannelModel, NewsSegment } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { NewsCenterI18n, NewsItem } from '@okr/social-news-center-util';

import { NewsAudioView } from './news-audio-view';
import { NewsTextView } from './news-text-view';
import { NewsVideoView } from './news-video-view';
import { NewsWebcamView } from './news-webcam-view';

/**
 * Full-size view of one item; switches on `segment`. Read-only, so there is no change-confirmation
 * (this is not an edit modal). `imageUrl` / `capturedAt` are only used for the webcam segment.
 */
@Component({
  selector: 'okr-news-detail-modal',
  standalone: true,
  imports: [
    Header, IonButton, IonIcon, IonContent, SvgIconPipe,
    NewsVideoView, NewsAudioView, NewsTextView, NewsWebcamView,
  ],
  styles: [`.open-org { display: flex; justify-content: center; padding: 8px 16px 16px; }`],
  template: `
    <okr-header [i18n]="{ title: channel()?.name ?? item().title }" [isModal]="true" />
    <ion-content>
      @switch (segment()) {
        @case ('video') { <okr-news-video-view [item]="item()" [channel]="channel()" [i18n]="i18n()" /> }
        @case ('audio') { <okr-news-audio-view [item]="item()" [channel]="channel()" /> }
        @case ('text') { <okr-news-text-view [item]="item()" [channel]="channel()" [i18n]="i18n()" /> }
        @case ('webcam') {
          <okr-news-webcam-view [imageUrl]="imageUrl() || item().mediaUrl || ''" [capturedAt]="capturedAt()" [i18n]="i18n()" />
        }
      }
      @if (openOrg(); as open) {
        <div class="open-org">
          <ion-button fill="clear" (click)="open()">
            <ion-icon slot="start" src="{{ 'link' | svgIcon }}" />
            {{ i18n().open_org() }}
          </ion-button>
        </div>
      }
    </ion-content>
  `,
})
export class NewsDetailModal {
  public readonly item = input.required<NewsItem>();
  public readonly channel = input<NewsChannelModel>();
  public readonly segment = input<NewsSegment>('video');
  public readonly i18n = input.required<NewsCenterI18n>();
  public readonly imageUrl = input('');
  public readonly capturedAt = input<Date | null>(null);
  /** the camera's host org (design 2026-11-09 §5.4): set by the host only when there is one and the app can open orgs */
  public readonly openOrg = input<(() => Promise<void>) | undefined>(undefined);
}
