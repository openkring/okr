import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';

import { vestFormsViewProviders } from 'ngx-vest-forms';
import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { PHONE_LENGTH } from '@bk2/shared-constants';
import { coerceBoolean } from '@bk2/shared-util-core';
import { ChPhoneMask } from '@bk2/shared-config';

import { ButtonCopy } from './button-copy';

@Component({
  selector: 'bk-phone',
  standalone: true,
  imports: [
    FormsModule, MaskitoDirective,
    IonItem, IonInput, IonNote,
    ButtonCopy
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
  <ion-item lines="none">
    <ion-input
      type="tel"
      [name]="name()"
      [ngModel]="value()"
      (ngModelChange)="value.set($event)"
      labelPlacement="floating"
      label="{{'@input.' + name() + '.label'}}"
      placeholder="{{'@input.' + name() + '.placeholder'}}"
      inputMode="tel"
      [counter]="!isReadOnly()"
      [maxlength]="maxLength()"
      autocomplete="tel"
      [clearInput]="shouldClearInput()"
      [readonly]="isReadOnly()"
      [maskito]="phoneMask"
      [maskitoElement]="maskPredicate"
    />
    @if (isCopyable()) {
      <bk-button-copy [value]="value()" tabindex="-1" />
    }
  </ion-item>
  @if(shouldShowHelper()) {
    <ion-item lines="none" class="helper">
      <ion-note>{{'@input.' + name() + '.helper'}}</ion-note>
    </ion-item>
  }
  `
})
export class PhoneInput {
  // inputs
  public value = model.required<string>(); // mandatory view model
  public name = input('phone'); // name of the input field
  public readOnly = input.required<boolean>();
  public maxLength = input(PHONE_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false);
  public clearInput = input(true); // show an icon to clear the input field

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));

  // mask 
  protected phoneMask = ChPhoneMask;
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as HTMLIonInputElement).getInputElement();
}
