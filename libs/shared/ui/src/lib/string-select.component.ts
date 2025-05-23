import { Component, input, output } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonItem, IonNote, IonSelect, IonSelectOption, SelectChangeEventDetail } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared/i18n';

@Component({
  selector: 'bk-string-select',
  imports: [
    TranslatePipe, AsyncPipe,
    IonSelect, IonSelectOption, IonNote, IonItem
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
      <ion-select [name]="name()"
        label="{{ '@input.' + name() + '.label' | translate | async }}"
        [disabled]="readOnly()"
        label-placement="floating"
        interface="popover"
        [value]="selectedString()"
        (ionChange)="onChange($event)">
        @for(stringValue of stringList(); track stringValue) {
          <ion-select-option [value]="stringValue">{{ stringValue }}</ion-select-option>
        }
      </ion-select>
    </ion-item>

      @if(showHelper()) {
    <ion-item lines="none">
        <ion-note>{{ '@input.' + name() + '.helper' | translate | async }}</ion-note>
    </ion-item>
      }

  `
})
export class StringSelectComponent {
  public name = input.required<string>(); // mandatory name of the input field
  public selectedString = input(''); // initial selection

  // if you have a string enum, you may convert it with:
  // Object.values(YourEnum)
  public stringList = input.required<string[]>(); // mandatory view model
  public readOnly = input(false); // if true, the input field is read-only
  public showHelper = input(false);
  public changed = output<string>();

  protected onChange($event: CustomEvent<SelectChangeEventDetail>): void {
    this.changed.emit($event.detail.value as string);
  }
}
