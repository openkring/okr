import { Component, computed, input, model } from '@angular/core';
import { IonItem, IonNote, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { coerceBoolean } from '@bk2/shared-util-core';

export interface StringSelectI18n {
  name: string;
  label: string;
  helper?: string;
}

@Component({
  selector: 'bk-string-select',
  standalone: true,
  imports: [
    IonSelect, IonSelectOption, IonNote, IonItem
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
      <ion-select [name]="i18n().name"
        [label]="i18n().label"
        [disabled]="isReadOnly()"
        label-placement="floating"
        interface="popover"
        [value]="selectedString()"
        (ionChange)="selectedString.set($event.detail.value)">
        @for(stringValue of stringList(); track stringValue) {
          <ion-select-option [value]="stringValue">{{ stringValue }}</ion-select-option>
        }
      </ion-select>
    </ion-item>
    @if(i18n().helper) {
      <ion-item lines="none">
        <ion-note style="white-space: pre-line">{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class StringSelect {
  // inputs
  public i18n = input.required<StringSelectI18n>();
  public selectedString = model(''); // initial selection

  // if you have a string enum, you may convert it with:
  // Object.values(YourEnum)
  public stringList = input.required<string[]>(); // mandatory view model
  public readOnly = input.required<boolean>();

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
}
