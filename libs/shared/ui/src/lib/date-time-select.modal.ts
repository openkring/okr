import { Component, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonCheckbox, IonContent, IonDatetime, IonInput, IonItem, ModalController } from '@ionic/angular/standalone';

import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { dismissOverlay } from '@okr/shared-util-angular';

import { Header } from './header';

export interface DateTimeSelectModalI18n {
  title: string;
  ok: string;
  cancel: string;
  withTime: string;
}

@Component({
  selector: 'okr-date-time-select-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonDatetime, IonItem, IonCheckbox, IonInput, IonButtons, IonButton
  ],
  template: `
    <okr-header [i18n]="{ title: labels().title }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-datetime
        #datetimePicker
        min="1900-01-01T00:00:00" max="2100-12-31T23:59:59"
        presentation="date"
        [value]="isoDate()"
        locale="de-ch"
        firstDayOfWeek="1"
        [showDefaultButtons]="false"
        size="cover"
        [preferWheel]="false"
        style="height: 420px; --padding-start: 0;"
        (ionChange)="selectedDate.set($any($event).detail.value)"
      />
      <ion-item lines="none">
        <ion-checkbox labelPlacement="end" [checked]="withTime()" (ionChange)="withTime.set($any($event).detail.checked)">
          {{ labels().withTime }}
        </ion-checkbox>
        @if (withTime()) {
          <ion-input
            slot="end"
            type="time"
            [value]="time()"
            (ionChange)="time.set($any($event).detail.value || time())"
            style="max-width: 120px; text-align: end;"
          />
        }
      </ion-item>
      <ion-buttons class="ion-justify-content-end">
        <ion-button (click)="cancel()">{{ labels().cancel }}</ion-button>
        <ion-button (click)="confirm()">{{ labels().ok }}</ion-button>
      </ion-buttons>
    </ion-content>
  `,
})
export class DateTimeSelectModal {
  private readonly modalController = inject(ModalController);
  protected readonly datetimePicker = viewChild.required<IonDatetime>('datetimePicker');

  public isoDateTime = input(getTodayStr(DateFormat.IsoDate) + 'T08:00:00');
  public i18n = input<Partial<DateTimeSelectModalI18n>>({});

  // Domain-agnostic defaults resolved here; a caller may still override any single label.
  private readonly defaults = inject(I18nService).translateAll({
    title: '@shared/ui.select.dateTime', ok: '@ok', cancel: '@cancel', withTime: '@shared/ui.withTime',
  });
  protected readonly labels = computed<DateTimeSelectModalI18n>(() => ({
    title:    this.i18n().title    ?? this.defaults.title(),
    ok:       this.i18n().ok       ?? this.defaults.ok(),
    cancel:   this.i18n().cancel   ?? this.defaults.cancel(),
    withTime: this.i18n().withTime ?? this.defaults.withTime(),
  }));

  /** Time is opt-in: unchecked returns a date-only token, checked appends the time below. */
  protected readonly withTime = signal(false);

  /** The calendar always picks a date only; the time is entered separately in the checkbox row. */
  protected readonly isoDate = computed(() => this.isoDateTime().substring(0, 10));

  /** Tracks the date tapped in the calendar; seeded from the incoming date, confirmed via the OK button. */
  protected readonly selectedDate = linkedSignal(() => this.isoDate());

  /** Seeded from the incoming ISO time (falls back to 08:00); user-editable via the time input. */
  protected readonly time = linkedSignal(() => {
    const t = this.isoDateTime().substring(11, 16);
    return /^\d{2}:\d{2}$/.test(t) ? t : '08:00';
  });

  protected async confirm(): Promise<void> {
    const selected = this.selectedDate() || this.datetimePicker().value || this.isoDate();
    const raw = Array.isArray(selected) ? selected[0] : selected;
    const date = String(raw).substring(0, 10);
    // Append the separately-entered time only when the checkbox is on; else return a date-only token.
    const isoStr = this.withTime() ? `${date}T${this.time()}:00` : date;
    await dismissOverlay(this.modalController, isoStr, 'confirm');
  }

  protected async cancel(): Promise<boolean> {
    return await dismissOverlay(this.modalController, null, 'cancel');
  }
}
