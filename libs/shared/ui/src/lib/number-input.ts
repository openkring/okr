import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { AutoComplete, InputMode, INT_LENGTH } from '@bk2/shared-constants';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopy, ButtonCopyI18n } from './button-copy';

export interface NumberInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper: string;
  copy_conf?: string;
}

@Component({
  selector: 'bk-number-input',
  standalone: true,
  imports: [
    FormsModule,
    IonItem, IonInput, IonNote,
    ButtonCopy
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
  <ion-item lines="none">
    <ion-input
      type="number"
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
      <bk-button-copy [i18n]="buttonCopyI18n()" [value]="value()" tabindex="-1" />
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

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf ?? '' } as ButtonCopyI18n));
}
