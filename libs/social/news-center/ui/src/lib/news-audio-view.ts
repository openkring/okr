import { Component, computed, ElementRef, input, signal, viewChild } from '@angular/core';
import { IonButton } from '@ionic/angular';

import { NewsChannelModel } from '@okr/shared-models';
import { NewsItem } from '@okr/social-news-center-util';

import { formatNewsDate, isHttpUrl } from './news-date';

/** Cover, native `<audio>` with −15 s / +30 s and speed buttons; episode notes as plain text. */
@Component({
  selector: 'okr-news-audio-view',
  standalone: true,
  imports: [IonButton],
  styles: [`
    :host { display: block; }
    .cover { display: block; width: min(100%, 360px); aspect-ratio: 1 / 1; margin: 16px auto 0; object-fit: cover; border-radius: 12px; }
    .body { padding: 16px; }
    h2 { margin: 0 0 4px; font-size: 1.2rem; }
    .sub { color: var(--ion-color-medium); font-size: 0.85rem; }
    audio { width: 100%; margin: 16px 0 8px; }
    .controls { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .summary { margin-top: 12px; white-space: pre-line; }
  `],
  template: `
    @if (item().thumbnailUrl) {
      <img class="cover" [src]="item().thumbnailUrl" alt="" loading="lazy" />
    }
    <div class="body">
      <h2>{{ item().title }}</h2>
      <div class="sub">
        @if (channel(); as ch) { {{ ch.name }} }
        @if (date()) { · {{ date() }} }
      </div>
      @if (audioUrl(); as src) {
        <audio #player [src]="src" controls preload="none"></audio>
        <div class="controls">
          <ion-button size="small" fill="outline" (click)="skip(-15)">−15 s</ion-button>
          <ion-button size="small" fill="outline" (click)="skip(30)">+30 s</ion-button>
          @for (r of rates; track r) {
            <ion-button size="small" [fill]="rate() === r ? 'solid' : 'clear'" (click)="setRate(r)">{{ r }}×</ion-button>
          }
        </div>
      }
      @if (item().summary) {
        <p class="summary">{{ item().summary }}</p>
      }
    </div>
  `,
})
export class NewsAudioView {
  public readonly item = input.required<NewsItem>();
  public readonly channel = input<NewsChannelModel>();

  protected readonly rates = [1, 1.25, 1.5, 2];
  protected readonly rate = signal(1);
  private readonly player = viewChild<ElementRef<HTMLAudioElement>>('player');

  protected readonly audioUrl = computed(() => (isHttpUrl(this.item().mediaUrl) ? this.item().mediaUrl : ''));
  protected readonly date = computed(() => formatNewsDate(this.item().publishedAt));

  protected skip(seconds: number): void {
    const audio = this.player()?.nativeElement;
    if (audio) audio.currentTime = Math.max(0, audio.currentTime + seconds);
  }

  protected setRate(rate: number): void {
    this.rate.set(rate);
    const audio = this.player()?.nativeElement;
    if (audio) audio.playbackRate = rate;
  }
}
