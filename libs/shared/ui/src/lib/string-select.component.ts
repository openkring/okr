import { AsyncPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { IonItem, IonNote, IonSelect, IonSelectOption, SelectChangeEventDetail } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared-i18n';
import { coerceBoolean } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-string-select',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonSelect, IonSelectOption, IonNote, IonItem
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
      <ion-select [name]="name()"
        label="{{ '@input.' + name() + '.label' | translate | async }}"
        [disabled]="isReadOnly()"
        label-placement="floating"
        interface="popover"
        [value]="selectedString()"
        (ionChange)="onChange($event)">
        @for(stringValue of stringList(); track stringValue) {
          <ion-select-option [value]="stringValue">{{ stringValue }}</ion-select-option>
        }
      </ion-select>
    </ion-item>

      @if(shouldShowHelper()) {
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
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public showHelper = input(false);
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  public changed = output<string>();

  protected onChange($event: CustomEvent<SelectChangeEventDetail>): void {
    this.changed.emit($event.detail.value as string);
  }
}
