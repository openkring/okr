
import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonInput, IonItem, IonNote, ModalController } from '@ionic/angular/standalone';

import { vestFormsViewProviders } from 'ngx-vest-forms';
import { MaskitoElementPredicate } from '@maskito/core';
import { MaskitoDirective } from '@maskito/angular';

import { ChTimeMask } from '@bk2/shared-config';
import { InputMode, TIME_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean, getCurrentTime } from '@bk2/shared-util-core';

import { TimeSelectModalComponent } from './time-select.modal';

@Component({
  selector: 'bk-time-input',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MaskitoDirective, FormsModule,
    IonItem, IonIcon, IonInput, IonNote
  ],
  styles: [`ion-item.helper { --min-height: 0; }`],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
        <ion-icon  src="{{'calendar' | svgIcon }}" slot="start" (click)="selectTime()" />
        <ion-input
          type="text"
          [name]="name()"
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
          [value]="value()"
          labelPlacement="floating"
          label="{{'@input.' + name() + '.label' | translate | async }}"
          placeholder="{{'@input.' + name() + '.placeholder' | translate | async }}"
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
    @if(shouldShowHelper()) {
      <ion-item lines="none" class="helper">
        <ion-note>{{'@input.' + name() + '.helper' | translate | async}}</ion-note>
      </ion-item>
    }
  `
})
export class TimeInputComponent {
  protected modalController = inject(ModalController);

  // inputs
  public value = model.required<string>(); // mandatory view model
  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input.required<boolean>();
  public clearInput = input(true); // show an icon to clear the input field
  public inputMode = input<InputMode>('numeric'); // A hint to the browser for which keyboard to display.
  public showHelper = input(false); // helper text to be shown below the input field
  public locale = input.required<string>(); // mandatory locale for the input field, used for formatting

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldClearInput = computed(() => coerceBoolean(this.clearInput()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));

  // passing constants to the template
  protected timeLength = TIME_LENGTH;
  protected timeMask = ChTimeMask;
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as HTMLIonInputElement).getInputElement();

  protected async selectTime(time?: string): Promise<void> {
    const _time = time && time.length === 5 ? time : getCurrentTime();
    if (this.readOnly()) return;
    const modal = await this.modalController.create({
      component: TimeSelectModalComponent,
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
        console.error('TimeInputComponent.selectTime: type of returned data is not string or not 5 chars long: ', data);
      }
    }
  }
}
