import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, input, model, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { AnyCharacterMask } from '@bk2/shared-config';
import { AutoComplete, InputMode, NAME_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopyComponent } from './button-copy.component';

@Component({
  selector: 'bk-text-input',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    ButtonCopyComponent,
    FormsModule, MaskitoDirective,
    IonItem, IonNote, IonInput
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
    <ion-item lines="none" [button]="false">
      <ion-input #textInput
        type="text"
        [name]="name()" 
        [ngModel]="value()"
        (ngModelChange)="onChange($event)"
        labelPlacement="floating"
        label="{{label2() | translate | async }}"
        placeholder="{{placeholder2() | translate | async }}"
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
        <bk-button-copy [value]="value()" tabindex="-1" />
      }
    </ion-item>
    @if(shouldShowHelper()) {
      <ion-item lines="none" class="helper" [button]="false">
        <ion-note>{{helper2() | translate | async}}</ion-note>
      </ion-item>
    }
  `
})
export class TextInputComponent {
  // model and explicit output
  public value = model.required<string>(); // mandatory view model
  public valueChange = output<string>();

  // inputs
  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input.required<boolean>();
  public maxLength = input(NAME_LENGTH); // max number of characters allowed
  public clearInput = input(true); // show an icon to clear the input field
  public copyable = input(false); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false);
  public autocomplete = input<AutoComplete>('off'); // Automated input assistance in filling out form field values
  public inputMode = input<InputMode>('text'); // A hint to the browser for which keyboard to display.
  public mask = input(AnyCharacterMask);
  public label = input<string>(); // optional custom label of the input field
  public placeholder = input<string>(); // optional custom placeholder of the input field
  public helper = input<string>(); // optional custom helper text of the input field
  public dir = input<'ltr' | 'rtl' | 'auto'>('ltr');
  public autofocus = input(false); // if true, the input field is focused on component initialization

  // view children
  protected textInput = viewChild<IonInput>('textInput');

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));

  // computed
  protected label2 = computed(() => this.label() ?? `@input.${this.name()}.label`);
  protected placeholder2 = computed(() => this.placeholder() ?? `@input.${this.name()}.placeholder`);
  protected helper2 = computed(() => this.helper() ?? `@input.${this.name()}.helper`);  

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
    // stops on it before moving to the next field. Patch it to tabindex="-1"
    // whenever the value is non-empty (= when Ionic actually renders the button).
    effect(() => {
      if (!this.shouldClearInput() || !this.value()) return;
      const input = this.textInput();
      if (!input) return;
      requestAnimationFrame(() => {
        const clearBtn = ((input as unknown as { el: HTMLElement }).el)
          ?.shadowRoot?.querySelector<HTMLElement>('[part="clear-button"]');
        if (clearBtn) clearBtn.tabIndex = -1;
      });
    });
  }

// always emit change
  protected onChange(newValue: string): void {
    this.value.set(newValue);
    this.valueChange.emit(newValue);
  }
}
