import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { bitsOf, WordSize } from '@okr/instruments-calculator-util';

interface Nibble {
  readonly low: number;
  readonly bits: readonly { readonly index: number; readonly on: boolean }[];
}

/** All bits of the programmer value, most significant first, in groups of four. Tap toggles a bit. */
@Component({
  selector: 'okr-calculator-bits',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .bits { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; justify-content: flex-end; font-family: monospace; padding: 0 1rem; }
    button { background: none; border: none; padding: 0 0.1rem; font: inherit; color: var(--ion-color-medium); cursor: pointer; }
    button.on { color: var(--ion-color-dark); font-weight: 600; }
    .index { display: block; text-align: right; font-size: 0.6rem; color: var(--ion-color-medium); }
  `],
  template: `
    <div class="bits">
      @for (nibble of nibbles(); track nibble.low) {
        <div>
          <div>
            @for (bit of nibble.bits; track bit.index) {
              <button type="button" [class.on]="bit.on" (click)="toggled.emit(bit.index)">{{ bit.on ? 1 : 0 }}</button>
            }
          </div>
          <span class="index">{{ nibble.low }}</span>
        </div>
      }
    </div>
  `,
})
export class CalculatorBits {
  public readonly value = input.required<bigint>();
  public readonly wordSize = input.required<WordSize>();
  public readonly toggled = output<number>();

  protected readonly nibbles = computed<Nibble[]>(() => {
    const bits = bitsOf(this.value(), this.wordSize());
    const out: Nibble[] = [];
    for (let high = this.wordSize() - 1; high >= 0; high -= 4) {
      const indices = [high, high - 1, high - 2, high - 3];
      out.push({ low: high - 3, bits: indices.map(index => ({ index, on: bits[index] })) });
    }
    return out;
  });
}
