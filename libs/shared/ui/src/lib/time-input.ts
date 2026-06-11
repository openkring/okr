import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonInput, IonItem, IonNote, ModalController } from '@ionic/angular/standalone';

import { MaskitoElementPredicate } from '@maskito/core';
import { MaskitoDirective } from '@maskito/angular';

import { ChTimeMask } from '@bk2/shared-config';
import { InputMode, TIME_LENGTH } from '@bk2/shared-constants';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean, getCurrentTime } from '@bk2/shared-util-core';

import { TimeSelectModal } from './time-select.modal';

export interface TimeInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper?: string;
}

@Component({
  selector: 'bk-time-input',
  standalone: true,
  imports: [
    SvgIconPipe,
    MaskitoDirective, FormsModule,
    IonItem, IonIcon, IonInput, IonNote
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
    <ion-item lines="none">
        <ion-icon src="{{'calendar' | svgIcon }}" slot="start" (click)="selectTime()" />
        <ion-input
          type="text"
          [name]="i18n().name"
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
          [value]="value()"
          labelPlacement="floating"
          [label]="i18n().label"
          [placeholder]="i18n().placeholder"
          [inputMode]="inputMode()"
          [counter]="!isReadOnly()"
          [maxlength]="timeLength"
          autocomplete="off"
          [maskito]="timeMask"
          [maskitoElement]="maskPredicate"
          [clearInput]="shouldClearInput()"
          [readonly]="isReadOnly()"
          />
    </ion-item>
    @if(i18n().helper) {
      <ion-item lines="none" class="helper">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class TimeInput {
  protected modalController = inject(ModalController);

  // inputs
  public value = model.required<string>(); // mandatory view model
  public i18n = input.required<TimeInputI18n>();
  public readOnly = input.required<boolean>();
  public clearInput = input(true); // show an icon to clear the input field
  public inputMode = input<InputMode>('numeric'); // A hint to the browser for which keyboard to display.
  public locale = input.required<string>(); // mandatory locale for the input field, used for formatting

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));

  // passing constants to the template
  protected timeLength = TIME_LENGTH;
  protected timeMask = ChTimeMask;
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as unknown as HTMLIonInputElement).getInputElement();

  protected async selectTime(time?: string): Promise<void> {
    const _time = time && time.length === 5 ? time : getCurrentTime();
    if (this.readOnly()) return;
    const modal = await this.modalController.create({
      component: TimeSelectModal,
      cssClass: 'time-modal',
      componentProps: {
        time: _time,
        locale: this.locale()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (typeof(data) === 'string' && data.length === 5) {
        this.value.set(data);
      } else {
        console.error('TimeInput.selectTime: type of returned data is not string or not 5 chars long: ', data);
      }
    }
  }
}
