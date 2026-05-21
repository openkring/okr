import { Component, inject, input } from '@angular/core';
import { DatetimeChangeEventDetail, IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';

import { Header } from './header';

export interface TimeSelectModalI18n {
  title: string;
  ok: string;
  cancel: string;
}

@Component({
  selector: 'bk-time-select-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonDatetime
  ],
  template: `
      <bk-header [i18n]="{ title: i18n().title }" [isModal]="true" />
      <ion-content class="ion-no-padding">
        <ion-datetime
            [value]="time()"
            [locale]="locale()"
            presentation="time"
            [showDefaultButtons]="true"
            [doneText]="i18n().ok"
            [cancelText]="i18n().cancel"
            (ionChange)="onTimeSelected($event.detail)" />
      </ion-content>
  `,
})
export class TimeSelectModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public time = input.required<string>();
  public i18n = input<TimeSelectModalI18n>({ title: 'Zeit auswählen', ok: 'OK', cancel: 'Abbrechen' });
  protected locale = input.required<string>(); // mandatory locale for the input field, used for formatting

  /**
   * 
   * @param detail 
   * @returns string | string[] | undefined | null
   */
  protected async onTimeSelected(detail: DatetimeChangeEventDetail): Promise<boolean> {
    return await this.modalController.dismiss(detail.value, 'confirm');
  }

  protected async cancel(): Promise<boolean> {
    return await this.modalController.dismiss(null, 'cancel');
  }
}
