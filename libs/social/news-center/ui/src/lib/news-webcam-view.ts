import { Component, computed, input, linkedSignal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { NewsCenterI18n } from '@okr/social-news-center-util';

import { formatNewsTime } from './news-date';

/**
 * Latest webcam still. `imageUrl` (direct URL with cache-buster, or a `data:` URL from the relay)
 * and `capturedAt` come from the parent, which owns the refresh timer.
 */
@Component({
  selector: 'okr-news-webcam-view',
  standalone: true,
  imports: [IonIcon, SvgIconPipe],
  styles: [`
    :host { display: block; }
    img { display: block; width: 100%; height: auto; }
    .placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      aspect-ratio: 16 / 9; color: var(--ion-color-medium); background: var(--ion-color-light); }
    .placeholder ion-icon { font-size: 2rem; }
    .captured { padding: 8px 16px; color: var(--ion-color-medium); font-size: 0.85rem; }
  `],
  template: `
    @if (imageUrl() && !failed()) {
      <img [src]="imageUrl()" alt="" (error)="failed.set(true)" referrerpolicy="no-referrer" />
    } @else {
      <div class="placeholder">
        <ion-icon src="{{ 'image' | svgIcon }}" />
        <span>{{ i18n().image_unavailable() }}</span>
      </div>
    }
    @if (captured()) {
      <div class="captured">{{ captured() }}</div>
    }
  `,
})
export class NewsWebcamView {
  public readonly imageUrl = input.required<string>();
  public readonly capturedAt = input<Date | null>(null);
  public readonly i18n = input.required<NewsCenterI18n>();

  /** A new `imageUrl` (the next refresh) gets a fresh chance. */
  protected readonly failed = linkedSignal<string, boolean>({ source: this.imageUrl, computation: () => false });
  protected readonly captured = computed(() => formatNewsTime(this.capturedAt()));
}
