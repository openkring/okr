import { Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';

/**
 * A 16:9 poster tile for one album video (spec 1.82) — used in chat messages and CMS content.
 *
 * Presentation only: the caller signs the poster (VideoUrlService), resolves the labels and
 * decides what a click does. Deliberately free of player or chat libraries, because it renders
 * inside every chat timeline.
 *
 * States: `loading` → neutral surface; `!available` → neutral surface with `unavailableLabel`,
 * not clickable; otherwise the poster with a centred play marker. The title sits below.
 */
@Component({
  selector: 'okr-video-card',
  standalone: true,
  imports: [SvgIconPipe, IonIcon],
  styles: [`
    :host { display: block; max-width: 480px; }
    .poster {
      position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: 8px; overflow: hidden;
      background-color: var(--ion-color-step-150, var(--ion-color-light));
      background-size: cover; background-position: center; background-repeat: no-repeat;
    }
    .poster.clickable { cursor: pointer; }
    .poster.neutral {
      display: flex; align-items: center; justify-content: center; padding: 0.75rem;
      text-align: center; font-size: 0.85rem; color: var(--ion-color-medium);
    }
    .play-marker {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 2.5rem; color: #fff; padding: 0.5rem;
      background: rgba(0, 0, 0, 0.45); border-radius: 50%; pointer-events: none;
    }
    .title {
      margin: 0.35rem 0 0; font-size: 0.9rem; color: var(--ion-text-color);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
  `],
  template: `
    @if (loading()) {
      <div class="poster neutral"></div>
    } @else if (!available()) {
      <div class="poster neutral">{{ unavailableLabel() }}</div>
    } @else {
      <div class="poster clickable" role="button" tabindex="0"
           [style.background-image]="backgroundImage()"
           (click)="activate($event)" (keydown.enter)="activate($event)" (keydown.space)="activate($event)">
        <ion-icon class="play-marker" src="{{ 'play' | svgIcon }}" />
      </div>
    }
    @if (title()) {
      <p class="title">{{ title() }}</p>
    }
  `
})
export class VideoCard {
  public posterUrl = input('');
  public title = input('');
  public available = input(true);
  public loading = input(false);
  public unavailableLabel = input('');

  public clicked = output<void>();

  /**
   * The poster consumes its own activation: a host that reacts to clicks on a surrounding element
   * (a chat bubble opens its action sheet) keeps that reaction for the title and everything else,
   * but a tap on the poster only plays.
   */
  protected activate(event: Event): void {
    event.stopPropagation();
    this.clicked.emit();
  }

  /** The signed poster URL is used verbatim; an empty URL leaves the neutral surface colour. */
  protected readonly backgroundImage = computed(() => this.posterUrl() ? `url("${this.posterUrl()}")` : 'none');
}
