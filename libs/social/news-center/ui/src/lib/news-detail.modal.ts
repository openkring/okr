import { Component, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ModalController } from '@ionic/angular';

import { NewsChannelModel, NewsSegment } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { dismissOverlay } from '@okr/shared-util-angular';
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
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, SvgIconPipe,
    NewsVideoView, NewsAudioView, NewsTextView, NewsWebcamView,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ channel()?.name ?? item().title }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">
            <ion-icon slot="icon-only" src="{{ 'close' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @switch (segment()) {
        @case ('video') { <okr-news-video-view [item]="item()" [channel]="channel()" [i18n]="i18n()" /> }
        @case ('audio') { <okr-news-audio-view [item]="item()" [channel]="channel()" /> }
        @case ('text') { <okr-news-text-view [item]="item()" [channel]="channel()" [i18n]="i18n()" /> }
        @case ('webcam') {
          <okr-news-webcam-view [imageUrl]="imageUrl() || item().mediaUrl || ''" [capturedAt]="capturedAt()" [i18n]="i18n()" />
        }
      }
    </ion-content>
  `,
})
export class NewsDetailModal {
  private readonly modalController = inject(ModalController);

  public readonly item = input.required<NewsItem>();
  public readonly channel = input<NewsChannelModel>();
  public readonly segment = input<NewsSegment>('video');
  public readonly i18n = input.required<NewsCenterI18n>();
  public readonly imageUrl = input('');
  public readonly capturedAt = input<Date | null>(null);

  protected close(): Promise<boolean> {
    return dismissOverlay(this.modalController, null, 'cancel');
  }
}
