import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { MaskitoDirective } from '@maskito/angular';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { ChPhoneMask, MaskPredicate } from '@bk2/shared-config';
import { PHONE_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ButtonCopyComponent } from './button-copy.component';
import { coerceBoolean } from '@bk2/shared-util-core';

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
      [counter]="!isReadOnly()"
      [maxlength]="maxLength()"
      autocomplete="tel"
      [clearInput]="shouldClearInput()"
      [readonly]="isReadOnly()" 
      [maskito]="phoneMask"
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
export class PhoneInputComponent {
  public value = model.required<string>(); // mandatory view model
  public name = input('phone'); // name of the input field
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public maxLength = input(PHONE_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  public showHelper = input(false);
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  public clearInput = input(true); // show an icon to clear the input field
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
  public changed = output<string>();

  protected phoneMask = ChPhoneMask;
  protected maskPredicate = MaskPredicate;

  public onChange(event: CustomEvent): void {
    const _phone = event.detail.value as string;
    this.value.set(_phone);
    this.changed.emit(_phone);
  }
}
