import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { DatetimeChangeEventDetail, IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared/config';
import { TranslatePipe } from '@bk2/shared/i18n';
import { HeaderComponent } from './header.component';

@Component({
  selector: 'bk-time-select-modal',
  imports: [
    TranslatePipe, AsyncPipe, 
    HeaderComponent,
    IonContent, IonDatetime
  ],
  template: `
      <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
      <ion-content class="ion-padding">
        <ion-datetime 
            [value]="time()"
            [locale]="locale"
            presentation="time"
            [showDefaultButtons]="true"
            doneText="{{'@general.operation.change.ok' | translate | async}}"
            cancelText="{{'@general.operation.change.cancel' | translate | async}}"
            (ionChange)="onTimeSelected($event.detail)" />
      </ion-content>
  `,
})
export class TimeSelectModalComponent {
  private readonly modalController = inject(ModalController);
  protected env = inject(ENV);

  public time = input.required<string>();
  public title = input('@general.operation.select.time');
  protected locale = this.env.i18n.locale;

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
