import { Component, computed, input, model } from '@angular/core';
import { IonItem, IonNote, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { coerceBoolean } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-string-select',
  standalone: true,
  imports: [
    
    IonSelect, IonSelectOption, IonNote, IonItem
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
      <ion-select [name]="name()"
        label="{{ label() }}"
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

      @if(shouldShowHelper()) {
    <ion-item lines="none">
        <ion-note style="white-space: pre-line">{{ helperNote() }}</ion-note>
    </ion-item>
      }
  `
})
export class StringSelect {

  // inputs
  public name = input.required<string>(); // mandatory name of the input field
  public selectedString = model(''); // initial selection

  // if you have a string enum, you may convert it with:
  // Object.values(YourEnum)
  public stringList = input.required<string[]>(); // mandatory view model
  public readOnly = input.required<boolean>();
  public showHelper = input(false);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));

  // computed derived fields
  protected helperNote = computed(() => `@input.${this.name()}.helper`);
  protected label = computed(() => `@input.${this.name()}.label`);

}
