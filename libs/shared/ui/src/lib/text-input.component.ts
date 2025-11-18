import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';

import { vestFormsViewProviders } from 'ngx-vest-forms';

import { AnyCharacterMask, MaskPredicate } from '@bk2/shared-config';
import { AutoComplete, InputMode, SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';

import { ButtonCopyComponent } from './button-copy.component';
import { coerceBoolean } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-text-input',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    ButtonCopyComponent,
    FormsModule,
    IonItem, IonNote, IonInput
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`
    ion-item.helper { --min-height: 0; }
  `],
  template: `
    <ion-item lines="none">
      <ion-input (ionInput)="onChange($event)"
        type="text"
        [name]="name()" 
        [ngModel]="value()"
        labelPlacement="floating"
        label="{{label2() | translate | async }}"
        placeholder="{{placeholder2() | translate | async }}"
        [inputMode]="inputMode()"
        [counter]="!isReadOnly()"
        [maxlength]="maxLength()"
        [autocomplete]="autocomplete()"
        [clearInput]="shouldClearInput()"
        [readonly]="isReadOnly()"
        [attr.dir]="dir()"
      />
      <!--
      11/2025: maskito currently leads to errors (reverse input), therefore disabled for now
              [maskito]="mask()"
        [maskitoElement]="maskPredicate"
  -->
      @if (isCopyable()) {
        <bk-button-copy [value]="value()" />
      }
    </ion-item>
    @if(shouldShowHelper()) {
      <ion-item lines="none" class="helper">
        <ion-note>{{helper2() | translate | async}}</ion-note>
      </ion-item>
    }
  `
})
export class TextInputComponent {
  public value = model.required<string>(); // mandatory view model
  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public maxLength = input(SHORT_NAME_LENGTH); // max number of characters allowed
  public clearInput = input(true); // show an icon to clear the input field
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
  public copyable = input(false); // if true, a button to copy the value of the input field is shown
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  public showHelper = input(false);
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  public autocomplete = input<AutoComplete>('off'); // Automated input assistance in filling out form field values
  public inputMode = input<InputMode>('text'); // A hint to the browser for which keyboard to display.
  public mask = input(AnyCharacterMask);
  public label = input<string>(); // optional custom label of the input field
  public placeholder = input<string>(); // optional custom placeholder of the input field
  public helper = input<string>(); // optional custom helper text of the input field
  public dir = input<'ltr' | 'rtl' | 'auto'>('ltr');

  protected label2 = computed(() => this.label() ?? `@input.${this.name()}.label`);
  protected placeholder2 = computed(() => this.placeholder() ?? `@input.${this.name()}.placeholder`);
  protected helper2 = computed(() => this.helper() ?? `@input.${this.name()}.helper`);  

  public changed = output<string>(); 

  protected maskPredicate = MaskPredicate;  

  public onChange(event: CustomEvent): void {
    const text = event.detail.value as string;
    this.value.set(text);
    console.log('emitting ', text);
    this.changed.emit(text);
  }
}
