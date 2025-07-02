import { AsyncPipe } from '@angular/common';
import { Component, input, model } from '@angular/core';
import { IonInput, IonInputPasswordToggle, IonItem, IonNote } from '@ionic/angular/standalone';

import { MaskitoElementPredicate, MaskitoOptions } from '@maskito/core';
import { MaskitoDirective } from '@maskito/angular';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared/i18n';
import { InputMode, PASSWORD_MAX_LENGTH } from '@bk2/shared/constants';
import { PasswordMask } from '@bk2/shared/config';
import { ButtonCopyComponent } from './button-copy.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'bk-password-input',
  imports: [
    TranslatePipe, AsyncPipe,
    FormsModule,
    ButtonCopyComponent,
    MaskitoDirective,
    IonItem, IonNote, IonInput, IonInputPasswordToggle
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
    <ion-item lines="none">
      @if(mask(); as mask) {
        <ion-input (ionInput)="onPasswordChange($event)"
          type="password"
          [name]="name()" 
          [ngModel]="value()"
          labelPlacement="floating"
          label="{{'@input.' + name() + '.label' | translate | async }}"
          placeholder="{{'@input.' + name() + '.placeholder' | translate | async }}"
          [inputMode]="inputMode()"
          [maxlength]="maxLength()"
          [clearInput]="clearInput()"
          [counter]="true"
          autocomplete="current-password"
          [maskito]="mask"
          [maskitoElement]="maskPredicate"
        >
          <ion-input-password-toggle slot="end"></ion-input-password-toggle>
        </ion-input>
        @if (copyable()) {
          <bk-button-copy [value]="value()" />
        }
      }
    </ion-item>
    @if(showHelper()) {
      <ion-item lines="none" class="helper">
        <ion-note>{{'@input.' + name() + '.helper' | translate | async}}</ion-note>
      </ion-item>
    }
  `
})
export class PasswordInputComponent {
  public value = model.required<string>(); // mandatory view model
  public name = input('password'); // name of the input field
  public maxLength = input(PASSWORD_MAX_LENGTH); // max number of characters allowed
  public clearInput = input(true); // show an icon to clear the input field
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false);
  public inputMode = input<InputMode>('text'); // A hint to the browser for which keyboard to display.

  // usefull masks: lowercaseWordMask, uppercaseWordMask, caseInsensitiveWordMask, passwordMask
  public mask = input<MaskitoOptions>(PasswordMask);
  readonly maskPredicate: MaskitoElementPredicate = async (el: HTMLElement) => (el as HTMLIonInputElement).getInputElement();

  protected onPasswordChange(event: CustomEvent): void {
    this.value.set(event.detail.value);
  }
}
