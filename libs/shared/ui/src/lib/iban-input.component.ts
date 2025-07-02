import { AsyncPipe } from '@angular/common';
import { Component, input, model, output } from '@angular/core';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { ChIbanMask } from '@bk2/shared/config';
import { IBAN_LENGTH } from '@bk2/shared/constants';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ButtonCopyComponent } from './button-copy.component';
import { FormsModule } from '@angular/forms';
import { vestFormsViewProviders } from 'ngx-vest-forms';

@Component({
  selector: 'bk-iban',
  imports: [
    TranslatePipe, AsyncPipe, 
    MaskitoDirective, FormsModule,
    IonItem, IonNote, IonInput,
    ButtonCopyComponent
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
        label="{{'@input.' + name() + '.label' | translate | async }}"
        placeholder="{{'@input.' + name() + '.placeholder' | translate | async }}"
        inputMode="text"
        [counter]="!readOnly()"
        [maxlength]="maxLength()"
        autocomplete="off"
        [clearInput]="clearInput()"
        [readonly]="readOnly()" 
        [maskito]="chIbanMask"
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
export class IbanComponent {
  public value = model.required<string>(); // mandatory view model
  public name = input('iban'); // name of the input field
  public readOnly = input(false); // if true, the input field is read-only
  public maxLength = input(IBAN_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public showHelper = input(true);
  public clearInput = input(true); // show an icon to clear the input field
  public changed = output<string>();

  protected chIbanMask = ChIbanMask;
  readonly maskPredicate: MaskitoElementPredicate = async (el: HTMLElement) => (el as HTMLIonInputElement).getInputElement();

  public onChange(event: CustomEvent): void {
    const _iban = event.detail.value;
    this.value.set(event.detail.value);
    this.changed.emit(_iban);
  }
}

