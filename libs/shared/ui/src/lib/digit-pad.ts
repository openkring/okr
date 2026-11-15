import { Component, input, model } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';

/**
 * A digit pad for entering a non-negative integer: the number shown large, ten digits, «C» and a
 * backspace, centred in its container. Use it instead of a text field where the phone keyboard
 * must not open — it pushes a modal around and offers letters nobody needs (e.g. the Jass card
 * points). A digit that would go above `max` is ignored.
 */
@Component({
  selector: 'okr-digit-pad',
  standalone: true,
  imports: [IonButton, IonIcon, SvgIconPipe],
  styles: [`
    :host { display: block; max-width: 360px; margin: 0 auto; } /* centred in its column */
    .label { font-size: 0.9rem; color: var(--ion-color-medium); }
    .display { font-size: 2.6rem; font-weight: 600; text-align: right; padding: 4px 12px; min-height: 56px;
      border-bottom: 2px solid var(--ion-color-medium); margin-bottom: 8px; font-variant-numeric: tabular-nums; }
    .display.disabled { color: var(--ion-color-medium); }
    .keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .keys ion-button { margin: 0; height: 56px; font-size: 1.6rem; --border-radius: 12px; }
    .keys ion-icon { font-size: 28px; }
  `],
  template: `
    <div class="label">{{ label() }}</div>
    <div class="display" [class.disabled]="disabled()" aria-live="polite">{{ value() }}</div>
    <div class="keys">
      @for (d of digits; track d) {
        <ion-button fill="outline" [disabled]="disabled()" (click)="press(d)">{{ d }}</ion-button>
      }
      <ion-button fill="clear" [disabled]="disabled()" (click)="setValue(0)" [attr.aria-label]="clearLabel()">C</ion-button>
      <ion-button fill="outline" [disabled]="disabled()" (click)="press(0)">0</ion-button>
      <ion-button fill="clear" [disabled]="disabled()" (click)="back()" [attr.aria-label]="backLabel()">
        <ion-icon slot="icon-only" src="{{ 'arrow-back' | svgIcon }}" />
      </ion-button>
    </div>
  `,
})
export class DigitPad {
  public readonly value = model(0);
  public readonly label = input('');
  public readonly max = input(Number.MAX_SAFE_INTEGER);
  public readonly disabled = input(false);
  public readonly clearLabel = input('C');
  public readonly backLabel = input('⌫');

  protected readonly digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  protected press(digit: number): void {
    const next = (this.value() || 0) * 10 + digit;
    if (next <= this.max()) this.setValue(next);
  }

  protected back(): void {
    this.setValue(Math.floor((this.value() || 0) / 10));
  }

  protected setValue(next: number): void {
    if (next !== this.value()) this.value.set(next);
  }
}
