import { Component, computed, input, model, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';

import { AutoComplete, InputMode, INT_LENGTH } from '@okr/shared-constants';
import { coerceBoolean } from '@okr/shared-util-core';

import { ButtonCopy, ButtonCopyI18n } from './button-copy';
import { SkipClearTab } from './skip-clear-tab.directive';

export interface NumberInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper: string;
  copy_conf?: string;
}

@Component({
  selector: 'okr-number-input',
  standalone: true,
  imports: [
    SkipClearTab,
    FormsModule,
    IonItem, IonInput, IonNote,
    ButtonCopy
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
  <ion-item lines="none">
    <ion-input
      #input
      type="number"
      (ionFocus)="onFocus()"
      [min]="min()"
      [max]="max()"
      [name]="i18n().name"
      [ngModel]="value()"
      (ngModelChange)="value.set($event)"
      labelPlacement="floating"
      label="{{i18n().label}}"
      placeholder="{{i18n().placeholder}}"
      [inputMode]="inputMode()"
      [counter]="!isReadOnly()"
      [maxlength]="maxLength()"
      [autocomplete]="autocomplete()"
      [clearInput]="shouldClearInput()"
      [readonly]="isReadOnly()"
    />
    @if (isCopyable()) {
      <okr-button-copy [i18n]="buttonCopyI18n()" [value]="value()" tabindex="-1" />
    }
  </ion-item>
  @if(shouldShowHelper()) {
    <ion-item lines="none" class="helper">
      <ion-note>{{i18n().helper}}</ion-note>
    </ion-item>
  }
  `
})
export class NumberInput {
  // inputs
  public value = model.required<number>();
  public i18n = input.required<NumberInputI18n>();
  public readOnly = input.required<boolean>();
  public maxLength = input(INT_LENGTH);
  public showHelper = input(false);
  public autocomplete = input<AutoComplete>('off');
  public copyable = input(false);
  public inputMode = input<InputMode>('decimal');
  public clearInput = input(true);
  public min = input<number>();
  public max = input<number>();
  /**
   * true (default): focusing selects the current value, so typing replaces it instead of
   * appending to it — a field showing 0 would otherwise turn into '03' when you type a 3.
   * Pass false where a user is expected to extend the existing number rather than retype it.
   */
  public selectOnFocus = input(true);

  // view children
  private readonly inputRef = viewChild.required<IonInput>('input');

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf } as ButtonCopyI18n));

  protected async onFocus(): Promise<void> {
    if (!coerceBoolean(this.selectOnFocus())) return;
    const el = await this.inputRef().getInputElement();
    el.select();
  }
}
