import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';

import { vestFormsViewProviders } from 'ngx-vest-forms';
import { MaskitoDirective } from '@maskito/angular';

import { TranslatePipe} from '@bk2/shared/i18n';
import { AnyCharacterMask, MaskPredicate } from '@bk2/shared/config';
import { AutoComplete, InputMode, SHORT_NAME_LENGTH } from '@bk2/shared/constants';
import { ButtonCopyComponent } from './button-copy.component';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'bk-text-input',
  imports: [
    TranslatePipe, AsyncPipe,
    ButtonCopyComponent,
    MaskitoDirective, FormsModule,
    IonItem, IonNote, IonInput
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
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
        [counter]="!readOnly()"
        [maxlength]="maxLength()"
        [autocomplete]="autocomplete()"
        [clearInput]="clearInput()"
        [readonly]="readOnly()"
        [maskito]="mask()"
        [maskitoElement]="maskPredicate"
      />
      @if (copyable()) {
        <bk-button-copy [value]="value()" />
      }
    </ion-item>
    @if(showHelper()) {
      <ion-item lines="none" class="helper">
        <ion-note>{{helper2() | translate | async}}</ion-note>
      </ion-item>
    }
  `
})
export class TextInputComponent {
  public value = model.required<string>(); // mandatory view model
  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input(false); // if true, the input field is read-only
  public maxLength = input(SHORT_NAME_LENGTH); // max number of characters allowed
  public clearInput = input(true); // show an icon to clear the input field
  public copyable = input(false); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false);
  public autocomplete = input<AutoComplete>('off'); // Automated input assistance in filling out form field values
  public inputMode = input<InputMode>('text'); // A hint to the browser for which keyboard to display.
  public mask = input(AnyCharacterMask);
  public label = input<string>(); // optional custom label of the input field
  public placeholder = input<string>(); // optional custom placeholder of the input field
  public helper = input<string>(); // optional custom helper text of the input field

  protected label2 = computed(() => this.label() ?? `@input.${this.name()}.label`);
  protected placeholder2 = computed(() => this.placeholder() ?? `@input.${this.name()}.placeholder`);
  protected helper2 = computed(() => this.helper() ?? `@input.${this.name()}.helper`);  

  public changed = output<string>(); 

  protected maskPredicate = MaskPredicate;  

  public onChange(event: CustomEvent): void {
    const _text = event.detail.value as string;
    this.value.set(_text);
    this.changed.emit(_text);
  }
}
