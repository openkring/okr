import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { URL_LENGTH } from '@bk2/shared-constants';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopy } from './button-copy';

@Component({
  selector: 'bk-url',
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
          type="url"
          [name]="name()"
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
          labelPlacement="floating"
          label="{{label2() }}"
          placeholder="{{placeholder2() }}"
          inputmode="url"
          [counter]="!isReadOnly()"
          [maxlength]="maxLength()"
          autocomplete="url"
          [clearInput]="shouldClearInput()"
          [readonly]="isReadOnly()" 
        />
        @if (isCopyable()) {
          <bk-button-copy [value]="value()" tabindex="-1" />
        }
    </ion-item>
    @if(shouldShowHelper()) {
      <ion-item lines="none" class="helper">
        <ion-note>{{helper2() }}</ion-note>
      </ion-item>
    }
  `
})
export class UrlInput {
  // inputs
  public value = model.required<string>(); // mandatory view model
  public name = input('url'); // name of the input field
  public readOnly = input.required<boolean>();
  public maxLength = input(URL_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false);
  public clearInput = input(true); // show an icon to clear the input field
  public label = input<string>(); // optional custom label of the input field
  public placeholder = input<string>(); // optional custom placeholder of the input field
  public helper = input<string>(); // optional custom helper text of the input field

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));

  // derived labels
  protected label2 = computed(() => this.label() ?? `@input.${this.name()}.label`);
  protected placeholder2 = computed(() => this.placeholder() ?? `@input.${this.name()}.placeholder`);
  protected helper2 = computed(() => this.helper() ?? `@input.${this.name()}.helper`);  
}
