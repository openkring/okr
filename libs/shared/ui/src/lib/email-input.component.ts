import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { EMAIL_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopyComponent } from './button-copy.component';

@Component({
  selector: 'bk-email',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, 
    FormsModule,
    IonItem, IonNote, IonInput,
    ButtonCopyComponent
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
  <ion-item lines="none">
    <ion-input
      type="email" 
      [name]="name()" 
      [ngModel]="value()"
      (ngModelChange)="value.set($event)"
      labelPlacement="floating"
      label="{{'@input.' + name() + '.label' | translate | async }}"
      placeholder="{{'@input.' + name() + '.placeholder' | translate | async }}"
      inputmode="email"
      [counter]="!isReadOnly()"
      [maxlength]="maxLength()"
      [autocomplete]="autocomplete()"
      [clearInput]="shouldShowClearInput()"
      [readonly]="isReadOnly()" 
    />
    @if (isCopyable()) {
      <bk-button-copy [value]="value()" />
    }
  </ion-item>
  @if(shouldShowHelper()) {
    <ion-item lines="none" class="helper">
      <ion-note>{{'@input.' + name() + '.helper' | translate | async}}</ion-note>
    </ion-item>
  }
  `
})
export class EmailInputComponent {
  // inputs
  public value = model.required<string>(); // mandatory view model
  public name = input('email'); // name of the input field
  public readOnly = input.required<boolean>();
  public maxLength = input(EMAIL_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false); // helper text to be shown below the input field
  public clearInput = input(true); // show an icon to clear the input field
  public autocomplete = input('email'); // autocomplete value for the input field

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected shouldShowClearInput = computed(() => coerceBoolean(this.clearInput()));
}
