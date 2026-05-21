import { Component, computed, effect, input, model, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { EMAIL_LENGTH } from '@bk2/shared-constants';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopy } from './button-copy';

export interface EmailInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper?: string;
  copy_conf?: string;
}

@Component({
  selector: 'bk-email',
  standalone: true,
  imports: [
    FormsModule,
    IonItem, IonNote, IonInput,
    ButtonCopy
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
  <ion-item lines="none" [button]="false">
    <ion-input #emailInput
      type="email"
      [name]="i18n().name"
      [ngModel]="value()"
      (ngModelChange)="value.set($event)"
      labelPlacement="floating"
      [label]="i18n().label"
      [placeholder]="i18n().placeholder"
      inputmode="email"
      [counter]="!isReadOnly()"
      [maxlength]="maxLength()"
      [autocomplete]="autocomplete()"
      [clearInput]="shouldShowClearInput()"
      [readonly]="isReadOnly()"
    />
    @if (isCopyable()) {
      <bk-button-copy [value]="value()" [i18n]="buttonCopyI18n()" tabindex="-1" />
    }
  </ion-item>
  @if(i18n().helper) {
    <ion-item lines="none" class="helper" [button]="false">
      <ion-note>{{ i18n().helper }}</ion-note>
    </ion-item>
  }
  `
})
export class EmailInput {
  // inputs
  public value = model.required<string>(); // mandatory view model
  public i18n = input.required<EmailInputI18n>();
  public readOnly = input.required<boolean>();
  public maxLength = input(EMAIL_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public clearInput = input(true); // show an icon to clear the input field
  public autocomplete = input('email'); // autocomplete value for the input field
  public autofocus = input(false); // if true, the input field is focused on component initialization

  // view children
  protected emailInput = viewChild<IonInput>('emailInput');

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldShowClearInput = computed(() => coerceBoolean(this.clearInput()));
  protected buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf ?? 'EMAIL_INPUT: NYI' }));

  constructor() {
    effect(() => {
      if (this.autofocus()) {
        setTimeout(() => {
          if (this.emailInput()) this.emailInput()?.setFocus();
        }, 500);
      }
    });
  }
}
