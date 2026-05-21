import { Component, computed, effect, input, model, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { AnyCharacterMask } from '@bk2/shared-config';
import { AutoComplete, InputMode, NAME_LENGTH } from '@bk2/shared-constants';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopy } from './button-copy';

export interface TextInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper: string;
  copy_conf?: string;
}

@Component({
  selector: 'bk-text-input',
  standalone: true,
  imports: [
    ButtonCopy,
    FormsModule, MaskitoDirective,
    IonItem, IonNote, IonInput
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
    <ion-item lines="none" [button]="false">
      <ion-input #textInput
        type="text"
        [name]="i18n().name"
        [ngModel]="value()" (ngModelChange)="onChange($event)"
        labelPlacement="floating"
        label="{{i18n().label }}"
        placeholder="{{i18n().placeholder }}"
        [inputMode]="inputMode()"
        [counter]="!isReadOnly()"
        [maxlength]="maxLength()"
        [maskito]="mask()"
        [maskitoElement]="maskPredicate"
        [autocomplete]="autocomplete()"
        [clearInput]="shouldClearInput()"
        [readonly]="isReadOnly()"
        [attr.dir]="dir()"
      />
      @if (isCopyable()) {
        <bk-button-copy [value]="value()" [i18n]="buttonCopyI18n()" tabindex="-1" />
      }
    </ion-item>
    @if(shouldShowHelper()) {
      <ion-item lines="none" class="helper" [button]="false">
        <ion-note>{{i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class TextInput {
  // model and explicit output
  public value = model.required<string>(); // mandatory view model
  public valueChange = output<string>();

  // inputs
  public i18n = input.required<TextInputI18n>();
  public readOnly = input.required<boolean>();
  public maxLength = input(NAME_LENGTH); // max number of characters allowed
  public clearInput = input(true); // show an icon to clear the input field
  public copyable = input(false); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false);
  public autocomplete = input<AutoComplete>('off'); // Automated input assistance in filling out form field values
  public inputMode = input<InputMode>('text'); // A hint to the browser for which keyboard to display.
  public mask = input(AnyCharacterMask);
  public dir = input<'ltr' | 'rtl' | 'auto'>('ltr');
  public autofocus = input(false); // if true, the input field is focused on component initialization

  // view children
  protected textInput = viewChild<IonInput>('textInput');

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected buttonCopyI18n = computed(() =>  { return { copy_conf: this.i18n().copy_conf ?? 'TEXT_INPUT: NYI'}});

  // passing constants to the template
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as HTMLIonInputElement).getInputElement();

 /**
   * sets focus into the search input field
   * see https://stackoverflow.com/questions/45786205/how-to-focus-ion-searchbar-on-button-click#45786266
   */
  constructor() {
    effect(() => {
      if (this.autofocus()) {
        setTimeout(() => {
          if (this.textInput()) this.textInput()?.setFocus();
        }, 500);
      }
    });

    // The Ionic clear button lives in the shadow DOM with tabindex="0", so Tab
    // stops on it before moving to the next field. Observe the shadow root and
    // set tabIndex=-1 on the button the moment Stencil renders it.
    effect((onCleanup) => {
      if (!this.shouldClearInput()) return;
      const input = this.textInput();
      if (!input) return;
      let observer: MutationObserver | undefined;
      input.getInputElement().then(nativeInput => {
        const shadowRoot = nativeInput.getRootNode() as ShadowRoot;
        const patch = () => {
          const btn = shadowRoot.querySelector<HTMLElement>('[part~="clear-button"]');
          if (btn) btn.tabIndex = -1;
        };
        patch();
        observer = new MutationObserver(patch);
        observer.observe(shadowRoot, { childList: true, subtree: true });
      });
      onCleanup(() => observer?.disconnect());
    });
  }

// always emit change
  protected onChange(newValue: string): void {
    this.value.set(newValue);
    this.valueChange.emit(newValue);
  }
}
