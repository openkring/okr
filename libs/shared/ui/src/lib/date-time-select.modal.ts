import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { IonCheckbox, IonContent, IonDatetime, IonItem, ModalController } from '@ionic/angular/standalone';

import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { Header } from './header';

export interface DateTimeSelectModalI18n {
  title: string;
  ok: string;
  cancel: string;
  withTime: string;
}

@Component({
  selector: 'okr-date-time-select-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonDatetime, IonItem, IonCheckbox
  ],
  template: `
    <okr-header [i18n]="{ title: i18n().title }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item lines="none">
        <ion-checkbox [checked]="withTime()" (ionChange)="withTime.set($any($event).detail.checked)">
          {{ i18n().withTime }}
        </ion-checkbox>
      </ion-item>
      <ion-datetime
        #datetimePicker
        min="1900-01-01T00:00:00" max="2100-12-31T23:59:59"
        [presentation]="withTime() ? 'date-time' : 'date'"
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
  public i18n = input<DateTimeSelectModalI18n>({ title: 'Datum & Zeit auswählen', ok: 'OK', cancel: 'Abbrechen', withTime: 'mit Uhrzeit' });

  /** Time is opt-in: unchecked shows a date-only picker, checked adds the time. */
  protected readonly withTime = signal(false);

  protected async onDateTimeChange(event: any): Promise<void> {
    const selected = event.detail.value || this.datetimePicker().value || this.isoDateTime();
    const raw = Array.isArray(selected) ? selected[0] : selected;
    // Without the time checkbox, drop any time part so formatDateToken renders a date-only token.
    const isoStr = this.withTime() ? raw : String(raw).substring(0, 10);
    await this.modalController.dismiss(isoStr, 'confirm');
  }

  protected async cancel(): Promise<boolean> {
    return await this.modalController.dismiss(null, 'cancel');
  }
}
