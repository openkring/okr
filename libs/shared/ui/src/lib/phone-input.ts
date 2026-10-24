import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { PHONE_LENGTH } from '@okr/shared-constants';
import { coerceBoolean } from '@okr/shared-util-core';
import { HelperVisibility } from '@okr/shared-util-angular';
import { IntlPhoneMask } from '@okr/shared-config';

import { ButtonCopy } from './button-copy';
import { SkipClearTab } from './skip-clear-tab.directive';

export interface PhoneInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper?: string;
  copy_conf?: string;
}

@Component({
  selector: 'okr-phone',
  standalone: true,
  imports: [
    SkipClearTab,
    FormsModule, MaskitoDirective,
    IonItem, IonInput, IonNote,
    ButtonCopy
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
  <ion-item lines="none">
    <ion-input
      type="tel"
      [name]="i18n().name"
      [ngModel]="value()"
      (ngModelChange)="value.set($event)"
      labelPlacement="floating"
      [label]="i18n().label"
      [placeholder]="i18n().placeholder"
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
      <okr-button-copy [value]="value()" [i18n]="buttonCopyI18n()" tabindex="-1" />
    }
  </ion-item>
  @if(shouldShowHelper() && i18n().helper) {
    <ion-item lines="none" class="helper">
      <ion-note>{{ i18n().helper }}</ion-note>
    </ion-item>
  }
  `
})
export class PhoneInput {
  private readonly helperVisibility = inject(HelperVisibility);
  /** false hides the helper text; the user's «Hilfetexte anzeigen» setting hides it as well */
  public readonly showHelper = input(true);
  protected readonly shouldShowHelper = computed(() => this.helperVisibility.showHelpers() && coerceBoolean(this.showHelper()));

  // inputs
  public value = model.required<string>(); // mandatory view model
  public i18n = input.required<PhoneInputI18n>();
  public readOnly = input.required<boolean>();
  public maxLength = input(PHONE_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public clearInput = input(true); // show an icon to clear the input field

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
  protected buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf }));

  // mask
  protected phoneMask = IntlPhoneMask;
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as unknown as HTMLIonInputElement).getInputElement();
}
