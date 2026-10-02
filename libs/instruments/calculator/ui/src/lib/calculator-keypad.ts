import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { CalcKey, KeyDef } from '@okr/instruments-calculator-util';

/** Renders a key layout as a CSS grid and emits the pressed key id. */
@Component({
  selector: 'okr-calculator-keypad',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .pad { display: grid; gap: 0.4rem; }
    button {
      min-height: 3rem; border: none; border-radius: 0.6rem; font-size: 1.15rem; cursor: pointer;
      touch-action: manipulation; user-select: none;
      background: var(--ion-color-light); color: var(--ion-color-dark);
    }
    button:active { filter: brightness(0.85); }
    button:disabled { opacity: 0.35; cursor: default; }
    button.op { background: var(--ion-color-secondary); color: var(--ion-color-secondary-contrast); }
    button.eq { background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    button.fn { background: var(--ion-color-light-shade); font-size: 0.95rem; }
    button.util { background: var(--ion-color-medium-tint); color: var(--ion-color-medium-contrast); }
    button.active { outline: 2px solid var(--ion-color-primary); }
  `],
  template: `
    <div class="pad" [style.grid-template-columns]="'repeat(' + columns() + ', minmax(0, 1fr))'">
      @for (key of keys(); track $index) {
        <button type="button"
          [class]="key.kind"
          [class.active]="key.active === true"
          [style.grid-column]="key.span ? 'span ' + key.span : null"
          [disabled]="disabled().includes(key.id)"
          (click)="pressed.emit(key.id)">{{ key.label }}</button>
      }
    </div>
  `,
})
export class CalculatorKeypad {
  public readonly keys = input.required<readonly KeyDef[]>();
  public readonly columns = input.required<number>();
  public readonly disabled = input<readonly CalcKey[]>([]);
  public readonly pressed = output<CalcKey>();
}
