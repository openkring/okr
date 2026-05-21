import { Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { URL_LENGTH } from '@bk2/shared-constants';
import { coerceBoolean } from '@bk2/shared-util-core';

import { ButtonCopy, ButtonCopyI18n } from './button-copy';

export interface ImageUrlInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper?: string;
  copy_conf?: string;
}

@Component({
  selector: 'bk-image-url-input',
  standalone: true,
  imports: [
    FormsModule,
    IonItem, IonInput, IonNote,
    ButtonCopy
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
      <ion-input (ionInput)="onChange($event)"
        type="url"
        [name]="i18n().name"
        [ngModel]="value()"
        labelPlacement="floating"
        [label]="i18n().label"
        [placeholder]="i18n().placeholder"
        inputmode="url"
        [counter]="!isReadOnly()"
        [maxlength]="maxLength()"
        autocomplete="url"
        [clearInput]="shouldClearInput()"
        [readonly]="isReadOnly()"
      />
      @if (isCopyable()) {
        <bk-button-copy [i18n]="buttonCopyI18n()" [value]="value()" tabindex="-1" />
      }
    </ion-item>
    @if(i18n().helper) {
      <ion-item lines="none" class="helper">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class ImageUrlInput {
  // inputs
  public value = model.required<string>(); // mandatory view model
  public i18n = input.required<ImageUrlInputI18n>();
  public readOnly = input.required<boolean>();
  public maxLength = input(URL_LENGTH); // max number of characters allowed
  public copyable = input(true); // if true, a button to copy the value of the input field is shown
  public clearInput = input(true); // show an icon to clear the input field

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));

  protected buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf ?? 'IMAGE_URL_INPUT: NYI' } as ButtonCopyI18n));

  // outputs
  public changed = output<string>();

  public onChange(event: CustomEvent): void {
    this.value.set(event.detail.value);
    this.changed.emit(this.value());
  }
}
