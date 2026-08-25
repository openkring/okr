import { Component, input } from '@angular/core';

/**
 * The small number badge on an accordion header ("Teilnehmer 14"), so a closed accordion
 * already answers whether opening it is worth it.
 *
 * Renders nothing at all for a count of 0 — an empty accordion should recede, not shout a zero.
 * Colours are driven by two custom properties so a parent can tint the pill without reaching
 * into this component's styles (e.g. an expanded accordion tinting it in the primary colour):
 * `--okr-pill-background` and `--okr-pill-color`.
 */
@Component({
  selector: 'okr-count-pill',
  standalone: true,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; }
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 26px;
      height: 20px;
      padding: 0 7px;
      border-radius: 10px;
      background: var(--okr-pill-background, var(--ion-color-light-shade));
      color: var(--okr-pill-color, var(--ion-color-dark));
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1;
    }
  `],
  template: `
    @if (count() > 0) {
      <span class="pill">{{ count() }}</span>
    }
  `
})
export class CountPill {
  /** number of entries behind the accordion; 0 renders nothing */
  public count = input<number>(0);
}
