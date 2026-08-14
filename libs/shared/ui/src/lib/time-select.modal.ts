import { Component, computed, inject, input } from '@angular/core';
import { DatetimeChangeEventDetail, IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';

import { Header } from './header';

export interface TimeSelectModalI18n {
  title: string;
  ok: string;
  cancel: string;
}

@Component({
  selector: 'okr-time-select-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonDatetime
  ],
  template: `
      <okr-header [i18n]="{ title: labels().title }" [isModal]="true" />
      <ion-content class="ion-no-padding">
        <ion-datetime
            [value]="time()"
            [locale]="locale()"
            presentation="time"
            [showDefaultButtons]="true"
            [doneText]="labels().ok"
            [cancelText]="labels().cancel"
            (ionChange)="onTimeSelected($event.detail)" />
      </ion-content>
  `,
})
export class TimeSelectModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public time = input.required<string>();
  public i18n = input<Partial<TimeSelectModalI18n>>({});

  // Domain-agnostic defaults resolved here; a caller may still override any single label.
  private readonly defaults = inject(I18nService).translateAll({ title: '@shared/ui.select.time', ok: '@ok', cancel: '@cancel' });
  protected readonly labels = computed<TimeSelectModalI18n>(() => ({
    title:  this.i18n().title  ?? this.defaults.title(),
    ok:     this.i18n().ok     ?? this.defaults.ok(),
    cancel: this.i18n().cancel ?? this.defaults.cancel(),
  }));
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
