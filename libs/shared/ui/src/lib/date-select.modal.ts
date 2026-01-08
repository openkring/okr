import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { DatetimeChangeEventDetail, IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';

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
        (ionChange)="onDateSelected($event.detail)"
      />
    </ion-content>
  `,
})
export class DateSelectModalComponent {
  private readonly modalController = inject(ModalController);

  // inputs
  public isoDate = input(getTodayStr(DateFormat.IsoDate)); // mandatory date in isoDate format (yyyy-MM-dd)
  public headerTitle = input('@general.operation.select.date');
  public locale = input('de-ch'); // locale for the input field, used for formatting
  public intro = input<string>();

  /**
   * @param detail 
   * @returns string in ISO format (yyyy-mm-dd)
   */
  protected async onDateSelected(detail: DatetimeChangeEventDetail): Promise<boolean> {
    return await this.modalController.dismiss(detail.value, 'confirm');
  }

  protected async cancel(): Promise<boolean> {
    return await this.modalController.dismiss(null, 'cancel');
  }
}
