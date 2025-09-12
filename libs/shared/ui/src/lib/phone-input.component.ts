import { AsyncPipe } from '@angular/common';
import { Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { MaskitoDirective } from '@maskito/angular';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { ChPhoneMask, MaskPredicate } from '@bk2/shared-config';
import { PHONE_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ButtonCopyComponent } from './button-copy.component';

@Component({
  selector: 'bk-phone',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    MaskitoDirective, FormsModule, 
    IonItem, IonInput, IonNote,
    ButtonCopyComponent
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
  <ion-item lines="none">
    <ion-input (ionInput)="onChange($event)"
      type="tel"
      [name]="name()"
      [ngModel]="value()"
      labelPlacement="floating"
      label="{{'@input.' + name() + '.label' | translate | async }}"
      placeholder="{{'@input.' + name() + '.placeholder' | translate | async }}"
      inputMode="tel"
      [counter]="!readOnly()"
      [maxlength]="maxLength()"
      autocomplete="tel"
      [clearInput]="clearInput()"
      [readonly]="readOnly()" 
      [maskito]="phoneMask"
      [maskitoElement]="maskPredicate"
    />
    @if (copyable()) {
      <bk-button-copy [value]="value()" />
    }
  </ion-item>
  @if(showHelper()) {
    <ion-item lines="none" class="helper">
      <ion-note>{{'@input.' + name() + '.helper' | translate | async}}</ion-note>
    </ion-item>
  }
  `
})
export class PhoneInputComponent {
  public value = model.required<string>(); // mandatory view model
  public name = input('phone'); // name of the input field
  public readOnly = input(false); // if true, the input field is read-only
  public maxLength = input(PHONE_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public showHelper = input(false);
  public clearInput = input(true); // show an icon to clear the input field
  public changed = output<string>();

  protected phoneMask = ChPhoneMask;
  protected maskPredicate = MaskPredicate;

  public onChange(event: CustomEvent): void {
    const _phone = event.detail.value as string;
    this.value.set(_phone);
    this.changed.emit(_phone);
  }
}
