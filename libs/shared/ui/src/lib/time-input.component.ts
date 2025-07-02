
import { Component, inject, input, model, output } from '@angular/core';
import { IonIcon, IonInput, IonItem, IonNote, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaskitoDirective } from '@maskito/angular';

import { ChTimeMask, MaskPredicate } from '@bk2/shared/config';
import { InputMode, TIME_LENGTH } from '@bk2/shared/constants';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { TranslatePipe } from '@bk2/shared/i18n';
import { getCurrentTime } from '@bk2/shared/util-core';
import { TimeSelectModalComponent } from './time-select.modal';

@Component({
  selector: 'bk-time-input',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MaskitoDirective, FormsModule,
    IonItem, IonIcon, IonInput, IonNote
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
    <ion-item lines="none">
        <ion-icon  src="{{'calendar' | svgIcon }}" slot="start" (click)="selectTime()" />
        <ion-input (ionChange)="onChange($event)"
          type="text"
          [name]="name()"
          [value]="value()"
          labelPlacement="floating"
          label="{{'@input.' + name() + '.label' | translate | async }}"
          placeholder="{{'@input.' + name() + '.placeholder' | translate | async }}"
          [inputMode]="inputMode()"
          [counter]="!readOnly()"
          [maxlength]="timeLength"
          autocomplete="off"
          [maskito]="timeMask"
          [maskitoElement]="maskPredicate"
          [clearInput]="clearInput()"
          [readonly]="readOnly()"
          />
    </ion-item>
    @if(showHelper()) {
      <ion-item lines="none" class="helper">
        <ion-note>{{'@input.' + name() + '.helper' | translate | async}}</ion-note>
      </ion-item>
    }
  `
})
export class TimeInputComponent {
  protected modalController = inject(ModalController);

  public value = model.required<string>(); // mandatory view model
  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input(false); // if true, the input field is read-only
  public clearInput = input(true); // show an icon to clear the input field
  public inputMode = input<InputMode>('numeric'); // A hint to the browser for which keyboard to display.
  public showHelper = input(false); // helper text to be shown below the input field
  public locale = input.required<string>(); // mandatory locale for the input field, used for formatting
  public changed = output<string>(); // output event when the value changes

  protected timeMask = ChTimeMask;
  protected maskPredicate = MaskPredicate;
  protected timeLength = TIME_LENGTH;

  public onChange(event: CustomEvent): void {
    this.value.set(event.detail.value);
    this.changed.emit(this.value());
  }

  protected async selectTime(time?: string): Promise<void> {
    const _time = time && time.length === 5 ? time : getCurrentTime();
    if (this.readOnly() === true) return;
    const _modal = await this.modalController.create({
      component: TimeSelectModalComponent,
      cssClass: 'time-modal',
      componentProps: {
        time: _time,
        locale: this.locale()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (typeof(data) === 'string' && data.length === 5) {
        this.value.set(data);
        this.changed.emit(data);
      } else {
        console.error('TimeInputComponent.selectTime: type of returned data is not string or not 5 chars long: ', data);
      }
    }
  }
}
