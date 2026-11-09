import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { IonButton, IonIcon } from '@ionic/angular';

import { NewsChannelModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { isNativePlatform } from '@okr/shared-util-angular';
import { NewsCenterI18n, NewsItem } from '@okr/social-news-center-util';

import { NewsImagePipe } from './news-image.pipe';

import { formatNewsDate } from './news-date';

const YOUTUBE_ID = /^[\w-]{1,32}$/;
const VIMEO_ID = /^\d{1,12}$/;

/**
 * Embedded player. The iframe URL is assembled here from the (re-validated) video id only — a
 * feed-supplied URL never reaches the sanitiser bypass. On a native shell the embed can be refused
 * by the platform (YouTube error 153); then the thumbnail plus the «Auf YouTube öffnen» link is shown.
 */
@Component({
  selector: 'okr-news-video-view',
  standalone: true,
  imports: [NewsImagePipe, IonButton, IonIcon, SvgIconPipe],
  styles: [`
    :host { display: block; }
    .player { position: relative; aspect-ratio: 16 / 9; width: 100%; background: #000; }
    iframe, .player img { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; object-fit: cover; }
    .body { padding: 16px; }
    h2 { margin: 0 0 4px; font-size: 1.2rem; }
    .sub { color: var(--ion-color-medium); font-size: 0.85rem; }
    .summary { margin-top: 12px; white-space: pre-line; }
  `],
  template: `
    <div class="player">
      @if (embedUrl(); as src) {
        @if (!isNative) {
          <iframe
            [src]="src" [title]="item().title" allowfullscreen loading="lazy"
            allow="fullscreen; picture-in-picture; encrypted-media"
            referrerpolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>
        } @else if (item().thumbnailUrl) {
          <img [src]="item().thumbnailUrl | newsImage" alt="" referrerpolicy="no-referrer" />
        }
      }
    </div>
    <div class="body">
      <h2>{{ item().title }}</h2>
      <div class="sub">
        @if (channel(); as ch) { {{ ch.name }} }
        @if (date()) { · {{ date() }} }
      </div>
      @if (watchUrl(); as url) {
        <ion-button fill="outline" size="small" [href]="url" target="_blank" rel="noopener noreferrer">
          {{ isVimeo() ? 'Vimeo' : i18n().open_on_youtube() }}
          <ion-icon slot="end" src="{{ 'arrow-forward' | svgIcon }}" />
        </ion-button>
      }
      @if (item().summary) {
        <p class="summary">{{ item().summary }}</p>
      }
    </div>
  `,
})
export class NewsVideoView {
  private readonly sanitizer = inject(DomSanitizer);

  public readonly item = input.required<NewsItem>();
  public readonly channel = input<NewsChannelModel>();
  public readonly i18n = input.required<NewsCenterI18n>();

  /** Native shells refuse many embeds (e.g. YouTube error 153) without any event, so skip the iframe there. */
  protected readonly isNative = isNativePlatform();

  private readonly videoId = computed(() => {
    const id = this.item().mediaUrl ?? '';
    const kind = this.channel()?.kind;
    if (kind === 'youtube') return YOUTUBE_ID.test(id) ? id : '';
    if (kind === 'vimeo') return VIMEO_ID.test(id) ? id : '';
    return '';
  });

  protected readonly embedUrl = computed<SafeResourceUrl | null>(() => {
    const id = this.videoId();
    if (!id) return null;
    const url = this.channel()?.kind === 'vimeo'
      ? `https://player.vimeo.com/video/${encodeURIComponent(id)}`
      : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected readonly isVimeo = computed(() => this.channel()?.kind === 'vimeo');

  /** Built from the validated id, never from `item.link`. */
  protected readonly watchUrl = computed(() => {
    const id = this.videoId();
    if (!id) return '';
    return this.isVimeo() ? `https://vimeo.com/${encodeURIComponent(id)}` : `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  });

  protected readonly date = computed(() => formatNewsDate(this.item().publishedAt));
}
