import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { CalculatorI18n, fitFontSize } from '@okr/instruments-calculator-util';

/** The number display: status chips, the RPN registers (T, Z, Y top-down) and the main value. Tap copies. */
@Component({
  selector: 'okr-calculator-display',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; padding: 0.5rem 1rem; text-align: right; }
    .chips { display: flex; gap: 0.25rem; min-height: 1.2rem; }
    .chip { font-size: 0.7rem; padding: 0 0.4rem; border-radius: 0.5rem; background: var(--ion-color-light); color: var(--ion-color-medium-shade); }
    .register { color: var(--ion-color-medium); font-size: 1rem; font-variant-numeric: tabular-nums; }
    .main { font-weight: 300; line-height: 1.15; white-space: nowrap; overflow: hidden; font-variant-numeric: tabular-nums; cursor: copy; }
    .main.error { color: var(--ion-color-danger); }
  `],
  template: `
    <div class="chips">
      @for (chip of chips(); track chip) { <span class="chip">{{ chip }}</span> }
    </div>
    @for (row of registers(); track $index) { <div class="register">{{ row }}</div> }
    <div class="main" [class.error]="error()" [style.font-size.rem]="fontSize()" (click)="copied.emit()">
      {{ error() ? i18n().error() : main() }}
    </div>
  `,
})
export class CalculatorDisplay {
  public readonly main = input.required<string>();
  public readonly stack = input<readonly string[]>([]);
  public readonly chips = input<readonly string[]>([]);
  public readonly error = input(false);
  public readonly i18n = input.required<CalculatorI18n>();
  public readonly copied = output<void>();

  protected readonly registers = computed(() => [...this.stack()].reverse());
  protected readonly fontSize = computed(() => fitFontSize(this.main().length));
}
