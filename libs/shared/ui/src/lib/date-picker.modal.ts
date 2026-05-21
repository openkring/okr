import { Component, input, output, signal } from '@angular/core';
import { IonModal, IonContent, IonDatetime } from '@ionic/angular/standalone';

import { getTodayStr, DateFormat } from '@bk2/shared-util-core';

export interface DatePickerModalI18n {
  ok: string;
  cancel: string;
}

@Component({
  selector: 'bk-date-picker-modal',
  standalone: true,
  imports: [IonModal, IonContent, IonDatetime],
  template: `
    <ion-modal
      [keepContentsMounted]="true"
      [isOpen]="isOpen()"
      (ionModalDidDismiss)="onDismiss($event)"
    >
      <ng-template>
        <ion-content class="ion-padding">
          <ion-datetime
            presentation="date"
            size="cover"
            [value]="isoDate()"
            locale="de-ch"
            firstDayOfWeek="1"
            showDefaultButtons="true"
            [doneText]="i18n().ok"
            [cancelText]="i18n().cancel"
            style="height: 380px;"
            (ionChange)="onDateChange($event.detail.value)"
            (ionCancel)="isOpen.set(false)"
          />
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
})
export class DatePickerModal {
  // inputs
  isoDate = input<string>(getTodayStr(DateFormat.IsoDate)); // yyyy-MM-dd
  public i18n = input<DatePickerModalI18n>({ ok: 'OK', cancel: 'Abbrechen' });

  // outputs
  dateSelected = output<string>();  // yyyy-MM-dd

  // signals
  protected isOpen = signal(false);

  // actions
  public open(): void {
    this.isOpen.set(true);
  }

  protected onDateChange(value: string | string[] | null | undefined): void {
    if (typeof value === 'string') {
      this.dateSelected.emit(value.substring(0, 10));
      this.isOpen.set(false);
    }
  }

  protected onDismiss(event: CustomEvent): void {
    if (event.detail.role === 'backdrop') {
      this.isOpen.set(false);
    }
  }
}
