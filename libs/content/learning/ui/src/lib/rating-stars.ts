import { Component, computed, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';

import { LearningI18n } from '@okr/content-learning-util';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Five stars, for showing an average (read-only) or for giving a rating (1..5).
 *
 * Read-only: `value` may carry decimals; it is rounded to the nearest half star, so 3.3 shows
 * three full stars and 3.6 three and a half; any average above 0 shows at least half a star.
 * Screen readers get one text («3.5 Sterne» / «Unter 1 Stern» / «Keine Bewertung») instead of five icons.
 * Input mode: five buttons labelled «n Sterne»; a tap emits `rate` with n. The parent stores the
 * rating and feeds the new `value` back — this component keeps no state of its own.
 */
@Component({
  selector: 'okr-rating-stars',
  standalone: true,
  imports: [SvgIconPipe, IonIcon],
  styles: [`
    :host { display: inline-flex; align-items: center; }
    .stars { display: inline-flex; gap: 2px; align-items: center; }
    .star { position: relative; display: inline-block; width: 1em; height: 1em; font-size: var(--okr-star-size, 1rem); }
    .star ion-icon { position: absolute; inset: 0; width: 1em; height: 1em; color: var(--ion-color-warning); }
    .star .fill { position: absolute; top: 0; left: 0; height: 1em; overflow: hidden; }
    .star .fill ion-icon { position: static; display: block; }
    button.star { padding: 0; margin: 0; border: 0; background: none; cursor: pointer; font-size: var(--okr-star-size, 1.5rem); }
    button.star:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; border-radius: 2px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `],
  template: `
    <span class="stars" role="group" [attr.aria-label]="label() || i18n().rating_label()">
      @for (n of stars; track n) {
        @if (readOnly()) {
          <span class="star" aria-hidden="true">
            <ion-icon src="{{ 'star-outline' | svgIcon }}" />
            <span class="fill" [style.width.%]="fillPercent(n)"><ion-icon src="{{ 'star' | svgIcon }}" /></span>
          </span>
        } @else {
          <button type="button" class="star" [attr.aria-label]="starLabel(n)" [attr.aria-pressed]="rounded() >= n"
                  (click)="rate.emit(n)">
            <ion-icon src="{{ 'star-outline' | svgIcon }}" />
            <span class="fill" [style.width.%]="fillPercent(n)"><ion-icon src="{{ 'star' | svgIcon }}" /></span>
          </button>
        }
      }
      @if (readOnly()) {
        <span class="sr-only">{{ valueText() }}</span>
      }
    </span>
  `
})
export class RatingStars {
  /** 0..5, decimals allowed (an average). 0 = nobody rated / no own rating yet. */
  public value = input(0);
  public readOnly = input(true);
  /** Accessible name of the star group; defaults to «Bewertung». */
  public label = input('');
  public i18n = input.required<LearningI18n>();

  /** 1..5, only in input mode. */
  public rate = output<number>();

  protected readonly stars = STARS;

  /** Clamped to 0..5. */
  private readonly clamped = computed(() => {
    const v = Number(this.value());
    return Number.isFinite(v) ? Math.min(5, Math.max(0, v)) : 0;
  });

  /** Rounded to the nearest half star; any rating above 0 shows at least half a star. */
  protected readonly rounded = computed(() => {
    const v = this.clamped();
    if (v <= 0) return 0;
    return Math.max(0.5, Math.round(v * 2) / 2);
  });

  protected readonly valueText = computed(() => {
    const v = this.clamped();
    if (v <= 0) return this.i18n().rating_none();
    if (v < 1) return this.i18n().rating_belowOne();
    return this.starLabel(this.rounded());
  });

  protected fillPercent(n: number): number {
    const r = this.rounded();
    if (r >= n) return 100;
    if (r === n - 0.5) return 50;
    return 0;
  }

  protected starLabel(n: number): string {
    return n === 1 ? this.i18n().rating_one() : fill(this.i18n().rating_many(), { n });
  }
}
