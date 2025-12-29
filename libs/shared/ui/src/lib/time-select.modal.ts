import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { DatetimeChangeEventDetail, IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';

import { HeaderComponent } from './header.component';

@Component({
  selector: 'bk-time-select-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, 
    HeaderComponent,
    IonContent, IonDatetime
  ],
  template: `
      <bk-header [title]="title()" [isModal]="true" />
      <ion-content class="ion-no-padding">
        <ion-datetime 
            [value]="time()"
            [locale]="locale()"
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

  // inputs
  public time = input.required<string>();
  public title = input('@general.operation.select.time');
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
