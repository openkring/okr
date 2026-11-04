import { Component, input } from '@angular/core';

import { EnergyTile } from '@okr/energy-util';

/**
 * Responsive grid of key figure tiles. Presentational: every text arrives formatted and translated.
 * Colours come from Ionic's step variables, which Ionic swaps in dark mode.
 */
@Component({
  selector: 'okr-energy-key-figures',
  imports: [],
  styles: [`
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
      gap: 0.75rem;
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.75rem;
      border-radius: 0.5rem;
      background: var(--ion-color-step-50);
      border: 1px solid var(--ion-color-step-150);
      color: var(--ion-text-color);
      min-width: 0;
    }
    .label { font-size: 0.8125rem; color: var(--ion-color-step-600); overflow-wrap: anywhere; }
    .value { font-size: 1.375rem; font-weight: 600; line-height: 1.2; overflow-wrap: anywhere; }
    .note { font-size: 0.75rem; color: var(--ion-color-step-600); overflow-wrap: anywhere; }
  `],
  template: `
    <div class="tiles">
      @for (tile of tiles(); track $index) {
        <div class="tile">
          <span class="label">{{ tile.label }}</span>
          <span class="value">{{ tile.value }}</span>
          @if (tile.note) {
            <span class="note">{{ tile.note }}</span>
          }
        </div>
      }
    </div>
  `
})
export class EnergyKeyFigures {
  // inputs
  public tiles = input.required<EnergyTile[]>();
}
