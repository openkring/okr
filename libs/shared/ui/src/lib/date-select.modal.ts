import { Component, inject, input, viewChild } from '@angular/core';
import { IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';

import { DateFormat, getTodayStr } from '@bk2/shared-util-core';

import { Header } from './header';

export interface DateSelectModalI18n {
  title: string;
  ok: string;
  cancel: string;
}

@Component({
  selector: 'bk-date-select-modal',
  standalone: true,
  imports: [

    Header,
    IonContent, IonDatetime
  ],
  template: `
    <bk-header [i18n]="{ title: i18n().title }" [isModal]="true" />
    <ion-content class="ion-padding">
      @if(intro(); as intro) {
        @if(intro.length > 0) {
          <small><div innerHTML="{{intro }}"></div></small>
        }
      }

      <ion-datetime
        #datetimePicker
        min="1900-01-01" max="2100-12-31"
        presentation="date"
        [value]="isoDate()"
        locale="de-ch"
        firstDayOfWeek="1"
        [showDefaultButtons]="true"
        [showAdjacentDays]="true"
        [doneText]="i18n().ok"
        [cancelText]="i18n().cancel"
        size="cover"
        [preferWheel]="false"
        style="height: 380px; --padding-start: 0;"
        (ionCancel)="cancel()"
        (ionChange)="onDateChange($event)"
      />
    </ion-content>
  `,
})
export class DateSelectModal {
  private modalController = inject(ModalController);
  protected readonly datetimePicker = viewChild.required<IonDatetime>('datetimePicker');

  // inputs
  public isoDate = input(getTodayStr(DateFormat.IsoDate)); // mandatory date in isoDate format (yyyy-MM-dd)
  public i18n = input<DateSelectModalI18n>({ title: 'Datum auswählen', ok: 'OK', cancel: 'Abbrechen' });
  public locale = input('de-ch'); // locale for the input field, used for formatting
  public intro = input<string>();

  /**
   * ionChange fires when OK button is clicked (with showDefaultButtons=true)
   * If user doesn't change the date, event.detail.value might be undefined
   * Fall back to the datetime component's actual value, then to isoDate input
   */
  protected async onDateChange(event: any): Promise<void> {
    const selectedDate = event.detail.value || this.datetimePicker().value || this.isoDate();
    await this.modalController.dismiss(selectedDate, 'confirm');
  }

  protected async cancel(): Promise<boolean> {
    return await this.modalController.dismiss(null, 'cancel');
  }
}
