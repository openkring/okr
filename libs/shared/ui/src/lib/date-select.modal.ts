import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { DatetimeChangeEventDetail, IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared/i18n';
import { HeaderComponent } from './header.component';

@Component({
  selector: 'bk-date-select-modal',
  imports: [
    TranslatePipe, AsyncPipe, 
    HeaderComponent,
    IonContent, IonDatetime
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
      <bk-header title="{{ header() | translate | async }}" [isModal]="true" />
      <ion-content class="ion-padding">
        <ion-datetime 
            min="1900-01-01" max="2025-12-31"
            [value]="isoDate()"
            [locale]="locale()"
            [firstDayOfWeek]="1"
            presentation="date"
            [showDefaultButtons]="true"
            doneText="{{'@general.operation.change.ok' | translate | async}}"
            cancelText="{{'@general.operation.change.cancel' | translate | async}}"
            (ionChange)="onDateSelected($event.detail)" />
      </ion-content>
  `,
})
export class DateSelectModalComponent {
  private readonly modalController = inject(ModalController);

  // tbd: switching to input signals leads to error: not a function
  // see: https://github.com/ionic-team/ionic-framework/issues/28876
  // see: https://github.com/ionic-team/ionic-framework/pull/29453 
  // should be fixed with Ionic 8.1.1 or 8.2 and is backwards-incompatible:  useSetInputAPI: true,
  public isoDate = input.required<string>();
  public header = input('@general.operation.select.date');
  protected locale = input('de-ch'); // locale for the input field, used for formatting

  /**
   * 
   * @param detail 
   * @returns string | string[] | undefined | null
   */
  protected async onDateSelected(detail: DatetimeChangeEventDetail): Promise<boolean> {
    return await this.modalController.dismiss(detail.value, 'confirm');
  }

  protected async cancel(): Promise<boolean> {
    return await this.modalController.dismiss(null, 'cancel');
  }
}
