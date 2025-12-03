import { Component, input, output, signal } from '@angular/core';
import { IonModal, IonContent, IonDatetime } from '@ionic/angular/standalone';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';
import { getTodayStr, DateFormat } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-date-picker-modal',
  standalone: true,
  imports: [IonModal, IonContent, IonDatetime, TranslatePipe, AsyncPipe],
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
            doneText="{{ '@general.operation.change.ok' | translate | async }}"
            cancelText="{{ '@general.operation.change.cancel' | translate | async }}"
            style="height: 380px;"
            (ionChange)="onDateChange($event.detail.value)"
            (ionCancel)="isOpen.set(false)"
          />
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
})
export class DatePickerModalComponent {
  isoDate = input<string>(getTodayStr(DateFormat.IsoDate)); // yyyy-MM-dd

  dateSelected = output<string>();  // yyyy-MM-dd

  protected isOpen = signal(false);

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