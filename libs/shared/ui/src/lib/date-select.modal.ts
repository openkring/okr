import { Component, computed, inject, input, viewChild } from '@angular/core';
import { IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';

import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { dismissOverlay } from '@okr/shared-util-angular';

import { Header } from './header';

export interface DateSelectModalI18n {
  title: string;
  ok: string;
  cancel: string;
}

@Component({
  selector: 'okr-date-select-modal',
  standalone: true,
  imports: [

    Header,
    IonContent, IonDatetime
  ],
  template: `
    <okr-header [i18n]="{ title: labels().title }" [isModal]="true" />
    <ion-content class="ion-padding">
      @if(intro(); as intro) {
        @if(intro.length > 0) {
          <small><div innerHTML="{{intro }}"></div></small>
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
        [doneText]="labels().ok"
        [cancelText]="labels().cancel"
        size="cover"
        [preferWheel]="false"
        style="height: 380px; --padding-start: 0;"
        (ionCancel)="cancel()"
        (ionChange)="onDateChange($event)"
      />
    </ion-content>
  `,
})
export class DateSelectModal {
  private modalController = inject(ModalController);
  protected readonly datetimePicker = viewChild.required<IonDatetime>('datetimePicker');

  // inputs
  public isoDate = input(getTodayStr(DateFormat.IsoDate)); // mandatory date in isoDate format (yyyy-MM-dd)
  public i18n = input<Partial<DateSelectModalI18n>>({});

  // Domain-agnostic defaults resolved here; a caller may still override any single label.
  private readonly defaults = inject(I18nService).translateAll({ title: '@shared/ui.select.date', ok: '@ok', cancel: '@cancel' });
  protected readonly labels = computed<DateSelectModalI18n>(() => ({
    title:  this.i18n().title  ?? this.defaults.title(),
    ok:     this.i18n().ok     ?? this.defaults.ok(),
    cancel: this.i18n().cancel ?? this.defaults.cancel(),
  }));
  public locale = input('de-ch'); // locale for the input field, used for formatting
  public intro = input<string>();

  /**
   * ionChange fires when OK button is clicked (with showDefaultButtons=true)
   * If user doesn't change the date, event.detail.value might be undefined
   * Fall back to the datetime component's actual value, then to isoDate input
   */
  protected async onDateChange(event: any): Promise<void> {
    const selectedDate = event.detail.value || this.datetimePicker().value || this.isoDate();
    await dismissOverlay(this.modalController, selectedDate, 'confirm');
  }

  protected async cancel(): Promise<boolean> {
    return await dismissOverlay(this.modalController, null, 'cancel');
  }
}
