import { Component, computed, inject, input, output, signal } from '@angular/core';
import { IonModal, IonContent, IonDatetime } from '@ionic/angular/standalone';

import { getTodayStr, DateFormat } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

export interface DatePickerModalI18n {
  ok: string;
  cancel: string;
}

@Component({
  selector: 'okr-date-picker-modal',
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
            min="1900-01-01" max="2100-12-31"
            presentation="date"
            [value]="isoDate()"
            [locale]="locale()"
            [firstDayOfWeek]="1"
            [showDefaultButtons]="true"
            [showAdjacentDays]="true"
            [doneText]="labels().ok"
            [cancelText]="labels().cancel"
            size="cover"
            [preferWheel]="false"
            style="height: 380px; --padding-start: 0;"
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
  public i18n = input<Partial<DatePickerModalI18n>>({});

  // Domain-agnostic defaults resolved here; a caller may still override any single label.
  private readonly defaults = inject(I18nService).translateAll({ ok: '@ok', cancel: '@cancel' });
  protected readonly labels = computed<DatePickerModalI18n>(() => ({
    ok:     this.i18n().ok     ?? this.defaults.ok(),
    cancel: this.i18n().cancel ?? this.defaults.cancel(),
  }));
  public locale = input('de-ch'); // locale for the calendar, used for formatting

  // outputs
  dateSelected = output<string>();  // yyyy-MM-dd

  // signals
  protected isOpen = signal(false);

  // actions
  public open(): void {
    this.isOpen.set(true);
  }

  /**
   * With showDefaultButtons, ionChange fires on OK — not on every day tap. `value` is
   * undefined when the user confirms without picking a different day, so close without
   * emitting rather than leaving the modal stuck open.
   */
  protected onDateChange(value: string | string[] | null | undefined): void {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw === 'string' && raw.length > 0) {
      this.dateSelected.emit(raw.substring(0, 10));
    }
    this.isOpen.set(false);
  }

  protected onDismiss(event: CustomEvent): void {
    if (event.detail.role === 'backdrop') {
      this.isOpen.set(false);
    }
  }
}
