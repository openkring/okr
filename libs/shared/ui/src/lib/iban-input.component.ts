import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { ChIbanMask } from '@bk2/shared-config';
import { IBAN_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopyComponent } from './button-copy.component';

@Component({
  selector: 'bk-iban',
  standalone: true,
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
      <ion-input
        type="text"
        [name]="name()"
        [ngModel]="value()"
        (ngModelChange)="value.set($event)"
        labelPlacement="floating"
        label="{{'@input.' + name() + '.label' | translate | async }}"
        placeholder="{{'@input.' + name() + '.placeholder' | translate | async }}"
        inputMode="text"
        [counter]="!isReadOnly()"
        [maxlength]="maxLength()"
        autocomplete="off"
        [clearInput]="shouldClearInput()"
        [readonly]="isReadOnly()" 
        [maskito]="chIbanMask"
        [maskitoElement]="maskPredicate"
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
export class IbanComponent {
  // inputs
  public value = model.required<string>(); // mandatory view model
  public name = input('iban'); // name of the input field
  public readOnly = input.required<boolean>();
  public maxLength = input(IBAN_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public showHelper = input(true);
  public clearInput = input(true); // show an icon to clear the input field

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));

  // passing constants to the template
  protected chIbanMask = ChIbanMask;
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as HTMLIonInputElement).getInputElement();
}

