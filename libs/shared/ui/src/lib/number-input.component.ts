import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { AutoComplete, InputMode, INT_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopyComponent } from './button-copy.component';

@Component({
  selector: 'bk-number-input',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    FormsModule,
    IonItem, IonInput, IonNote,
    ButtonCopyComponent
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
  <ion-item lines="none">
    <ion-input
      type="number"
      [name]="name()"
      [ngModel]="value()"
      (ngModelChange)="value.set($event)"
      labelPlacement="floating"
      label="{{label() | translate | async }}"
      placeholder="{{placeholder() | translate | async }}"
      [inputMode]="inputMode()"
      [counter]="!isReadOnly()"
      [maxlength]="maxLength()"
      [autocomplete]="autocomplete()"
      [clearInput]="shouldClearInput()"
      [readonly]="isReadOnly()"
    />
    @if (isCopyable()) {
      <bk-button-copy [value]="value()" />
    }
  </ion-item>
  @if(shouldShowHelper()) {
    <ion-item lines="none" class="helper">
      <ion-note>{{helper() | translate | async}}</ion-note>
    </ion-item>
  }
  `
})
export class NumberInputComponent {
  // inputs
  public value = model.required<number>(); // mandatory view model
  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input.required<boolean>();
  public maxLength = input(INT_LENGTH); // max number of characters allowed
  public showHelper = input(false);
  public autocomplete = input<AutoComplete>('off'); // Automated input assistance in filling out form field values
  public copyable = input(false); // if true, a button to copy the value of the input field is shown
  public inputMode = input<InputMode>('decimal'); // A hint to the browser for which keyboard to display.
  public clearInput = input(true); // show an icon to clear the input field

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));

  // computed
  protected label = computed(() => `@input.${this.name()}.label`);
  protected placeholder = computed(() => `@input.${this.name()}.placeholder`);
  protected helper = computed(() => `@input.${this.name()}.helper`);  
}
