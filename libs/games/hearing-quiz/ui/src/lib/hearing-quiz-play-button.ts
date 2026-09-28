import { Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';

/**
 * The large, central "Anhören" button (spec §5.2).
 *
 * `playing` must come from the audio element's own `playing`/`pause`/`ended` events, never from
 * the tap — then a blocked or failed clip can never show a false "playing" state. While it is
 * true, concentric rings pulse outward; `level` (0..1, from an AnalyserNode) scales them, which
 * also shows that the clip is not silent. With `prefers-reduced-motion` the rings are replaced by
 * a steady highlighted border; the label says "Spielt…" either way.
 */
@Component({
  selector: 'okr-hearing-quiz-play-button',
  standalone: true,
  imports: [SvgIconPipe, IonIcon],
  styles: [`
    :host { display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 16px 0 24px; }
    .hq-play {
      position: relative; width: 132px; height: 132px; border-radius: 50%;
      border: 4px solid var(--ion-color-primary); background: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast); cursor: pointer; display: grid; place-items: center;
      font-size: 64px; padding: 0;
      transition: transform 120ms ease;
    }
    .hq-play:active { transform: scale(0.96); }
    .hq-play:focus-visible { outline: 4px solid var(--ion-color-warning); outline-offset: 4px; }
    .hq-play.error { background: var(--ion-color-medium); border-color: var(--ion-color-medium); }
    .hq-play ion-icon { pointer-events: none; }
    .hq-ring {
      position: absolute; inset: -4px; border-radius: 50%; pointer-events: none;
      border: 3px solid var(--ion-color-primary); opacity: 0;
    }
    .playing .hq-ring { animation: hq-ripple 1.8s ease-out infinite; }
    .playing .hq-ring:nth-child(2) { animation-delay: 0.6s; }
    .playing .hq-ring:nth-child(3) { animation-delay: 1.2s; }
    @keyframes hq-ripple {
      from { transform: scale(1); opacity: 0.7; }
      to { transform: scale(var(--hq-ring-scale, 1.9)); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .playing .hq-ring { animation: none; }
      .playing.hq-play { box-shadow: 0 0 0 8px var(--ion-color-primary-tint); }
    }
    .hq-label { font-size: 1.25rem; font-weight: 600; text-align: center; min-height: 1.5em; }
    .hq-label.error { color: var(--ion-color-danger); font-weight: 500; font-size: 1rem; max-width: 22rem; }
  `],
  template: `
    <button type="button" class="hq-play" [class.playing]="playing()" [class.error]="error()"
      [style.--hq-ring-scale]="ringScale()" [attr.aria-label]="label()" [attr.aria-pressed]="playing()"
      [disabled]="disabled()" (click)="playClicked.emit()">
      <span class="hq-ring"></span><span class="hq-ring"></span><span class="hq-ring"></span>
      <ion-icon src="{{ (error() ? 'sync' : 'play') | svgIcon }}" />
    </button>
    <div class="hq-label" [class.error]="error()" aria-live="polite">{{ label() }}</div>
  `,
})
export class HearingQuizPlayButton {
  public readonly playing = input(false);
  public readonly level = input(0);
  public readonly error = input(false);
  public readonly disabled = input(false);
  public readonly playLabel = input('');
  public readonly playingLabel = input('');
  public readonly errorLabel = input('');

  public readonly playClicked = output<void>();

  protected readonly label = computed(() => {
    if (this.error()) return this.errorLabel();
    return this.playing() ? this.playingLabel() : this.playLabel();
  });
  /** Louder sound → wider rings (1.5 … 2.3). */
  protected readonly ringScale = computed(() => 1.5 + Math.min(1, Math.max(0, this.level())) * 0.8);
}
