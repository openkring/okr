import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonInputPasswordToggle, IonItem, IonNote } from '@ionic/angular/standalone';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate, MaskitoOptions } from '@maskito/core';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { PasswordMask } from '@bk2/shared-config';
import { InputMode, PASSWORD_MAX_LENGTH } from '@bk2/shared-constants';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopy, ButtonCopyI18n } from './button-copy';

export interface PasswordInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper?: string;
  copy_conf?: string;
}

@Component({
  selector: 'bk-password-input',
  standalone: true,
  imports: [
    FormsModule,
    ButtonCopy,
    MaskitoDirective,
    IonItem, IonNote, IonInput, IonInputPasswordToggle
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
    <ion-item lines="none" [button]="false">
      @if(mask(); as mask) {
        <ion-input
          type="password"
          [name]="i18n().name"
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
          labelPlacement="floating"
          [label]="i18n().label"
          [placeholder]="i18n().placeholder"
          [inputMode]="inputMode()"
          [maxlength]="maxLength()"
          [clearInput]="shouldClearInput()"
          [counter]="true"
          autocomplete="current-password"
          [maskito]="mask"
          [maskitoElement]="maskPredicate"
        >
          <ion-input-password-toggle slot="end" tabindex="-1"></ion-input-password-toggle>
        </ion-input>
        @if (isCopyable()) {
          <bk-button-copy [i18n]="buttonCopyI18n()" [value]="value()" tabindex="-1" />
        }
      }
    </ion-item>
    @if(i18n().helper) {
      <ion-item lines="none" class="helper" [button]="false">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class PasswordInput {
  // inputs
  public value = model.required<string>(); // mandatory view model
  public i18n = input.required<PasswordInputI18n>();
  public maxLength = input(PASSWORD_MAX_LENGTH); // max number of characters allowed
  public clearInput = input(true); // show an icon to clear the input field
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public inputMode = input<InputMode>('text'); // A hint to the browser for which keyboard to display.

  // coerced boolean inputs
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));

  protected buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf ?? 'PASSWORD_INPUT: NYI' } as ButtonCopyI18n));

  // usefull masks: lowercaseWordMask, uppercaseWordMask, caseInsensitiveWordMask, passwordMask
  public mask = input<MaskitoOptions>(PasswordMask);
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as unknown as HTMLIonInputElement).getInputElement();
}
