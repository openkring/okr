import { AsyncPipe } from '@angular/common';
import { Component, inject, input, viewChild } from '@angular/core';
import { IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { DateFormat, getTodayStr } from '@bk2/shared-util-core';

import { HeaderComponent } from './header.component';

@Component({
  selector: 'bk-date-select-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, 
    HeaderComponent,
    IonContent, IonDatetime
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    <ion-content class="ion-padding">
      @if(intro(); as intro) {
        @if(intro.length > 0) {
          <small><div innerHTML="{{intro | translate | async}}"></div></small>
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
        doneText="{{'@general.operation.change.ok' | translate | async}}"
        cancelText="{{'@general.operation.change.cancel' | translate | async}}"
        size="cover"
        [preferWheel]="false"
        style="height: 380px; --padding-start: 0;"
        (ionCancel)="cancel()"
        (ionChange)="onDateChange($event)"
      />
    </ion-content>
  `,
})
export class DateSelectModalComponent {
  private modalController = inject(ModalController);
  protected readonly datetimePicker = viewChild.required<IonDatetime>('datetimePicker');

  // inputs
  public isoDate = input(getTodayStr(DateFormat.IsoDate)); // mandatory date in isoDate format (yyyy-MM-dd)
  public headerTitle = input('@general.operation.select.date');
  public locale = input('de-ch'); // locale for the input field, used for formatting
  public intro = input<string>();

  /**
   * ionChange fires when OK button is clicked (with showDefaultButtons=true)
   * If user doesn't change the date, event.detail.value might be undefined
   * Fall back to the datetime component's actual value, then to isoDate input
   */
  protected async onDateChange(event: any): Promise<void> {
    const selectedDate = event.detail.value || this.datetimePicker().value || this.isoDate();
    console.log('event.detail.value:', event.detail.value);
    console.log('datetimePicker.value:', this.datetimePicker().value);
    console.log('isoDate():', this.isoDate());
    console.log('final selectedDate:', selectedDate);
    console.log('DateSelectModalComponent: selected date: ' + selectedDate); // for debugging
    await this.modalController.dismiss(selectedDate, 'confirm');
  }

  protected async cancel(): Promise<boolean> {
    return await this.modalController.dismiss(null, 'cancel');
  }
}
