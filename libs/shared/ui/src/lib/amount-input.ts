import { Component, computed, input, model, signal } from '@angular/core';
import { IonInput } from '@ionic/angular/standalone';

import { coerceBoolean } from '@okr/shared-util-core';

export interface AmountInputI18n {
  name: string;
  label?: string;
  placeholder?: string;
}

/** "1'000.00" ↔ 100000 (minor units). Accepts apostrophes, spaces and a comma as decimal separator. */
export function parseAmountToMinor(text: string): number {
  const cleaned = (text ?? '').replace(/['\s]/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function formatMinorAmount(minor: number): string {
  return ((minor || 0) / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * A money field. The model is the amount in minor units; the field shows it Swiss-formatted with
 * two decimals (1'000.00) and switches to the plain number while it has the focus, so typing is
 * not fought by the grouping.
 */
@Component({
  selector: 'okr-amount-input',
  standalone: true,
  imports: [IonInput],
  template: `
    <ion-input
      [name]="i18n().name"
      type="text"
      inputmode="decimal"
      [label]="i18n().label"
      [labelPlacement]="i18n().label ? 'floating' : undefined"
      [placeholder]="i18n().placeholder ?? '0.00'"
      [value]="display()"
      [readonly]="isReadOnly()"
      class="ion-text-end"
      (ionFocus)="onFocus()"
      (ionBlur)="onBlur()"
      (ionInput)="onInput($event)"
    />
  `,
})
export class AmountInput {
  public i18n = input.required<AmountInputI18n>();
  public value = model.required<number>();   // minor units
  public readOnly = input(false);

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  private editing = signal(false);
  private raw = signal('');

  protected display = computed(() => this.editing() ? this.raw() : formatMinorAmount(this.value()));

  protected onFocus(): void {
    if (this.isReadOnly()) return;
    this.raw.set(this.value() ? (this.value() / 100).toFixed(2) : '');
    this.editing.set(true);
  }

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value ?? '';
    this.raw.set(text);
    this.value.set(parseAmountToMinor(text));
  }

  protected onBlur(): void {
    this.editing.set(false);
  }
}
