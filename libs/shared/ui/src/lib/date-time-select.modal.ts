import { Component, inject, input, viewChild } from '@angular/core';
import { IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';

import { DateFormat, getTodayStr } from '@bk2/shared-util-core';

import { Header } from './header';

export interface DateTimeSelectModalI18n {
  title: string;
  ok: string;
  cancel: string;
}

@Component({
  selector: 'bk-date-time-select-modal',
  standalone: true,
  imports: [

    Header,
    IonContent, IonDatetime
  ],
  template: `
    <bk-header [i18n]="{ title: i18n().title }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-datetime
        #datetimePicker
        min="1900-01-01T00:00:00" max="2100-12-31T23:59:59"
        presentation="date-time"
        [value]="isoDateTime()"
        locale="de-ch"
        firstDayOfWeek="1"
        [showDefaultButtons]="true"
        [doneText]="i18n().ok"
        [cancelText]="i18n().cancel"
        size="cover"
        [preferWheel]="false"
        style="height: 480px; --padding-start: 0;"
        (ionCancel)="cancel()"
        (ionChange)="onDateTimeChange($event)"
      />
    </ion-content>
  `,
})
export class DateTimeSelectModal {
  private readonly modalController = inject(ModalController);
  protected readonly datetimePicker = viewChild.required<IonDatetime>('datetimePicker');

  public isoDateTime = input(getTodayStr(DateFormat.IsoDate) + 'T08:00:00');
  public i18n = input<DateTimeSelectModalI18n>({ title: 'Datum & Zeit auswählen', ok: 'OK', cancel: 'Abbrechen' });

  protected async onDateTimeChange(event: any): Promise<void> {
    const selected = event.detail.value || this.datetimePicker().value || this.isoDateTime();
    const isoStr = Array.isArray(selected) ? selected[0] : selected;
    await this.modalController.dismiss(isoStr, 'confirm');
  }

  protected async cancel(): Promise<boolean> {
    return await this.modalController.dismiss(null, 'cancel');
  }
}
