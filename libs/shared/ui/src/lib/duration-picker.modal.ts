import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCol, IonContent, IonDatetime, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';

import { validateVestTree } from '@bk2/shared-util-angular';
import {
  convertDateFormatToString,
  convertDateFromAnyFormatToString,
  coerceBoolean,
  DateFormat,
  getTodayStr,
  subDuration,
} from '@bk2/shared-util-core';

import { ChangeConfirmation } from './change-confirmation';
import { Header } from './header';
import { DurationPickerFormModel, durationPickerValidations } from './duration-picker.validations';

export interface DurationPickerModalI18n {
  title: string;
  from: string;
  to: string;
  cancel: string;
  save: string;
}

/**
 * Generic from/to duration picker. Shows two calendars side by side (use the
 * `.duration-picker-modal` cssClass for the side-by-side layout). `showDate` / `showTime`
 * decide whether the day selector and/or the time selector are shown.
 *
 * Inputs `fromDateTime` / `toDateTime` are optional store-format strings (StoreDate `yyyyMMdd`
 * or StoreDateTime `yyyyMMddHHmmss`). When omitted, the range defaults to the last week
 * (`from` = today − 7 days, `to` = today, no time).
 *
 * Dismisses on save with `{ from, to }` as StoreDateTime. In date-only mode `from` is expanded
 * to the start of its day (`…000000`) and `to` to the end of its day (`…235959`) so the range
 * stays inclusive.
 */
@Component({
  selector: 'bk-duration-picker-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    IonContent, IonGrid, IonRow, IonCol, IonDatetime,
  ],
  template: `
    <bk-header [i18n]="{ title: i18n().title }" [isModal]="true" />
    @if (showConfirmation()) {
      <bk-change-confirmation
        [i18n]="{ cancel: i18n().cancel, save: i18n().save }"
        (saveClicked)="save()"
        (cancelClicked)="revert()" />
    }
    <ion-content class="ion-padding">
      <form novalidate>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <div class="duration-header">{{ i18n().from }}</div>
              <ion-datetime
                [presentation]="presentation()"
                [value]="formData().from"
                [max]="formData().to"
                locale="de-ch"
                firstDayOfWeek="1"
                [showDefaultButtons]="false"
                size="cover"
                (ionChange)="onFromChange($any($event.detail.value))" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <div class="duration-header">{{ i18n().to }}</div>
              <ion-datetime
                [presentation]="presentation()"
                [value]="formData().to"
                [min]="formData().from"
                locale="de-ch"
                firstDayOfWeek="1"
                [showDefaultButtons]="false"
                size="cover"
                (ionChange)="onToChange($any($event.detail.value))" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </form>
    </ion-content>
  `,
})
export class DurationPickerModal {
  private readonly modalController = inject(ModalController);

  // inputs are optional store-format strings (StoreDate or StoreDateTime)
  public readonly fromDateTime = input<string>();
  public readonly toDateTime = input<string>();
  public readonly showDate = input(true);
  public readonly showTime = input(false);
  public readonly i18n = input<DurationPickerModalI18n>({
    title: 'Zeitraum wählen', from: 'Von', to: 'Bis', cancel: 'Abbrechen', save: 'Speichern',
  });

  // coerced flags (componentProps may pass strings)
  protected readonly showDateFlag = computed(() => coerceBoolean(this.showDate()));
  protected readonly showTimeFlag = computed(() => coerceBoolean(this.showTime()));

  // ion-datetime presentation derived from the two flags
  protected readonly presentation = computed<'date' | 'time' | 'date-time'>(() => {
    const date = this.showDateFlag();
    const time = this.showTimeFlag();
    if (date && time) return 'date-time';
    if (time && !date) return 'time';
    return 'date';
  });

  // ISO format used both for the ion-datetime value and the form model
  protected readonly isoFormat = computed(() => this.showTimeFlag() ? DateFormat.IsoDateTime : DateFormat.IsoDate);

  // signal form (ISO strings) with Vest validation
  protected readonly formData = signal<DurationPickerFormModel>({ from: '', to: '' });
  protected readonly durationForm = form(this.formData, (path) => validateVestTree(path, durationPickerValidations as any));

  // initial snapshot for revert; dirty/valid gate the change-confirmation banner
  private readonly initial = signal<DurationPickerFormModel>({ from: '', to: '' });
  protected readonly dirty = signal(false);
  protected readonly showConfirmation = computed(() => this.durationForm().valid() && this.dirty());

  private initialized = false;

  constructor() {
    // seed the form from the inputs (or the last-week default) once they resolve
    effect(() => {
      const iso = this.isoFormat();   // re-seed if the format changes before any edit
      if (this.initialized && this.dirty()) return;
      const from = this.toIso(this.fromDateTime(), iso, false);
      const to = this.toIso(this.toDateTime(), iso, true);
      this.formData.set({ from, to });
      this.initial.set({ from, to });
      this.initialized = true;
    });
  }

  /** Convert a store-format input (any length) to the picker's ISO format, falling back to the last-week default. */
  private toIso(store: string | undefined, isoFormat: DateFormat, isEnd: boolean): string {
    if (store && store.length > 0) {
      const iso = convertDateFromAnyFormatToString(store, isoFormat);
      if (iso) return iso;
    }
    const today = getTodayStr(DateFormat.StoreDate);
    const day = isEnd ? today : subDuration(today, { days: -7 }, DateFormat.StoreDate);
    return convertDateFromAnyFormatToString(day, isoFormat) ?? '';
  }

  /**
   * ion-datetime may emit ISO strings with milliseconds (`…:00.000`) or a timezone offset
   * (`…+02:00`). Trim to the bare date / date-time the form model expects.
   */
  private normalizeIso(value: string | null | undefined): string {
    if (!value) return '';
    return value.slice(0, this.showTimeFlag() ? 19 : 10);
  }

  protected onFromChange(value: string | null | undefined): void {
    this.formData.update((m) => ({ ...m, from: this.normalizeIso(value) }));
    this.dirty.set(true);
  }

  protected onToChange(value: string | null | undefined): void {
    this.formData.update((m) => ({ ...m, to: this.normalizeIso(value) }));
    this.dirty.set(true);
  }

  /** Revert edits (change-confirmation cancel); the header close button dismisses the modal. */
  protected revert(): void {
    this.formData.set(this.initial());
    this.dirty.set(false);
  }

  protected save(): void {
    const { from, to } = this.formData();
    this.modalController.dismiss({ from: this.toStore(from, false), to: this.toStore(to, true) }, 'confirm');
  }

  /** Convert the picker's ISO value back to StoreDateTime; date-only values fill the whole day. */
  private toStore(iso: string, isEnd: boolean): string {
    if (this.showTimeFlag()) {
      return convertDateFormatToString(iso, DateFormat.IsoDateTime, DateFormat.StoreDateTime, false);
    }
    const day = convertDateFormatToString(iso, DateFormat.IsoDate, DateFormat.StoreDate, false);
    return day ? day + (isEnd ? '235959' : '000000') : '';
  }
}
