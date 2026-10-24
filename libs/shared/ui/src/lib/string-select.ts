import { Component, computed, inject, input, model } from '@angular/core';
import { IonItem, IonNote, IonSelect, IonSelectOption } from '@ionic/angular';

import { coerceBoolean } from '@okr/shared-util-core';
import { HelperVisibility } from '@okr/shared-util-angular';

export interface StringSelectI18n {
  name: string;
  label: string;
  helper?: string;
}

@Component({
  selector: 'okr-string-select',
  standalone: true,
  imports: [
    IonSelect, IonSelectOption, IonNote, IonItem
  ],
  template: `
    <ion-item lines="none">
      <ion-select [name]="i18n().name"
        [label]="i18n().label"
        [disabled]="isReadOnly()"
        label-placement="floating"
        interface="popover"
        [value]="selectedString()"
        (ionChange)="selectedString.set($event.detail.value)">
        @for(stringValue of stringList(); track $index) {
          <ion-select-option [value]="stringValue">{{ labels()[$index] || stringValue }}</ion-select-option>
        }
      </ion-select>
    </ion-item>
    @if(shouldShowHelper() && i18n().helper) {
      <ion-item lines="none">
        <ion-note style="white-space: pre-line">{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class StringSelect {
  private readonly helperVisibility = inject(HelperVisibility);
  /** false hides the helper text; the user's «Hilfetexte anzeigen» setting hides it as well */
  public readonly showHelper = input(true);
  protected readonly shouldShowHelper = computed(() => this.helperVisibility.showHelpers() && coerceBoolean(this.showHelper()));

  // inputs
  public i18n = input.required<StringSelectI18n>();
  public selectedString = model(''); // initial selection

  // if you have a string enum, you may convert it with:
  // Object.values(YourEnum)
  public stringList = input.required<string[]>(); // mandatory view model
  /** optional translated labels, parallel to stringList; falls back to the raw value */
  public labels = input<string[]>([]);
  public readOnly = input.required<boolean>();

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
}
