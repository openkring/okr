import { Component, computed, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular';

import { URL_LENGTH } from '@okr/shared-constants';
import { coerceBoolean } from '@okr/shared-util-core';
import { HelperVisibility } from '@okr/shared-util-angular';

import { ButtonCopy, ButtonCopyI18n } from './button-copy';
import { SkipClearTab } from './skip-clear-tab.directive';

export interface ImageUrlInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper?: string;
  copy_conf?: string;
}

@Component({
  selector: 'okr-image-url-input',
  standalone: true,
  imports: [
    SkipClearTab,
    FormsModule,
    IonItem, IonInput, IonNote,
    ButtonCopy
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
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
        <okr-button-copy [i18n]="buttonCopyI18n()" [value]="value()" tabindex="-1" />
      }
    </ion-item>
    @if(shouldShowHelper() && i18n().helper) {
      <ion-item lines="none" class="helper">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class ImageUrlInput {
  private readonly helperVisibility = inject(HelperVisibility);
  /** false hides the helper text; the user's «Hilfetexte anzeigen» setting hides it as well */
  public readonly showHelper = input(true);
  protected readonly shouldShowHelper = computed(() => this.helperVisibility.showHelpers() && coerceBoolean(this.showHelper()));

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

  protected buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf } as ButtonCopyI18n));

  // outputs
  public changed = output<string>();

  public onChange(event: CustomEvent): void {
    this.value.set(event.detail.value);
    this.changed.emit(this.value());
  }
}
