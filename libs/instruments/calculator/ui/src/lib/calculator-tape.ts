import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';

import { CalculatorI18n, HistoryEntry } from '@okr/instruments-calculator-util';

/** The history strip, newest first. Tapping a row loads its result. */
@Component({
  selector: 'okr-calculator-tape',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton],
  styles: [`
    :host { display: block; }
    .head { display: flex; align-items: center; justify-content: space-between; font-weight: 600; padding: 0 0.5rem; }
    .empty { color: var(--ion-color-medium); padding: 0 0.5rem; }
    .row { display: block; width: 100%; text-align: right; background: none; border: none; padding: 0.4rem 0.5rem; cursor: pointer; color: inherit; border-bottom: 1px solid var(--ion-color-light); }
    .row:hover { background: var(--ion-color-light); }
    .expression { display: block; font-size: 0.85rem; color: var(--ion-color-medium); }
    .result { font-variant-numeric: tabular-nums; }
  `],
  template: `
    <div class="head">
      <span>{{ i18n().history_title() }}</span>
      @if (entries().length > 0) {
        <ion-button fill="clear" size="small" (click)="cleared.emit()">{{ i18n().history_clear() }}</ion-button>
      }
    </div>
    @if (entries().length === 0) {
      <p class="empty">{{ i18n().history_empty() }}</p>
    }
    @for (entry of entries(); track $index) {
      <button type="button" class="row" (click)="picked.emit(entry)">
        <span class="expression">{{ entry.expression }}</span>
        <span class="result">= {{ entry.result }}</span>
      </button>
    }
  `,
})
export class CalculatorTape {
  public readonly entries = input.required<readonly HistoryEntry[]>();
  public readonly i18n = input.required<CalculatorI18n>();
  public readonly picked = output<HistoryEntry>();
  public readonly cleared = output<void>();
}
