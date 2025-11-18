import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { EMAIL_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ButtonCopyComponent } from './button-copy.component';
import { coerceBoolean } from '@bk2/shared-util-core';

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
    <ion-input (ionInput)="onChange($event)"
      type="email" 
      [name]="name()" 
      [ngModel]="value()"
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
  public value = model.required<string>(); // mandatory view model
  public name = input('email'); // name of the input field
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public maxLength = input(EMAIL_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  public showHelper = input(false); // helper text to be shown below the input field
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  public clearInput = input(true); // show an icon to clear the input field
  protected shouldShowClearInput = computed(() => coerceBoolean(this.clearInput()));
  public autocomplete = input('email'); // autocomplete value for the input field
  public changed = output<string>();

  public onChange(event: CustomEvent): void {
    const _email = event.detail.value;
    this.value.set(event.detail.value);
    this.changed.emit(_email);
  }
}
