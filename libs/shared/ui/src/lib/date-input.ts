import { Component, computed, input, linkedSignal, model, viewChild } from '@angular/core';
import { IonIcon, IonItem, IonNote } from '@ionic/angular/standalone';
import { MaskitoOptions } from '@maskito/core';

import { DATE_LENGTH, InputMode } from '@okr/shared-constants';
import { SvgIconPipe } from '@okr/shared-pipes';
import { classifyStoreDate, coerceBoolean, convertDateFormatToString, DateFormat, formatPartialStoreDate, getTodayStr, parsePartialViewDate } from '@okr/shared-util-core';
import { ChAnyDate, ChPartialDate } from '@okr/shared-config';

import { ViewDateInput, ViewDateInputI18n } from './viewdate-input';
import { DatePickerModal } from './date-picker.modal';

export interface DateInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper?: string;
}

@Component({
  selector: 'okr-date-input',
  standalone: true,
  imports: [
    SvgIconPipe,
    ViewDateInput, DatePickerModal,
    IonItem, IonIcon, IonNote
  ],
  styles: [`
    ion-item.helper { --min-height: 0; }
    okr-viewdate-input { width: 100%; }
  `],
  template: `
    <ion-item lines="none">
      @if(shouldShowDateSelect() && !isReadOnly()) {
        <ion-icon src="{{'calendar' | svgIcon }}" slot="start" (click)="datePicker.open()" />
      }
      <okr-viewdate-input
        [viewDate]="viewDate()"
        (viewDateChange)="onViewDateChange($event)"
        [i18n]="viewDateI18n()"
        [readOnly]="isReadOnly()"
        [clearInput]="shouldShowClearInput()"
        [inputMode]="inputMode()"
        [maxLength]="maxLength()"
        [mask]="effectiveMask()"
        [autocomplete]="autocomplete()"
      />
    </ion-item>

    <okr-date-picker-modal #datePicker
      [isoDate]="isoDate()"
      (dateSelected)="updateStoreDate($event, isoFormat)"
    />

    @if(i18n().helper) {
      <ion-item lines="none" class="helper">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class DateInput {
  protected datePickerModal = viewChild.required<DatePickerModal>(DatePickerModal);

  // storeDate is the interface to the parent components (forms), because it is how the date is stored in the database.
  // for the DateSelection component, we need to convert into isoDate format.
  // for the ion-input field, we need to convert into viewDate format (using the view-date-input component).
  // optional date in StoreDate format (yyyyMMdd); default is today
  public storeDate = model(getTodayStr(DateFormat.StoreDate));

  protected viewDate = linkedSignal(() => {
    const store = this.storeDate();
    if (classifyStoreDate(store) === 'full') {
      return convertDateFormatToString(store, DateFormat.StoreDate, DateFormat.ViewDate, false) ?? '';
    }
    // '1985' or '15.04.' when partials are allowed; nothing otherwise
    return this.isPartialAllowed() ? formatPartialStoreDate(store) : '';
  });

  public i18n = input.required<DateInputI18n>();
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public clearInput = input(true); // show an icon to clear the input field
  protected shouldShowClearInput = computed(() => coerceBoolean(this.clearInput()));
  public inputMode = input<InputMode>('numeric'); // A hint to the browser for which keyboard to display.
  public maxLength = input(DATE_LENGTH);
  public autocomplete = input('off'); // can be set to bday for birth date
  public showDateSelect = input(true);
  protected shouldShowDateSelect = computed(() => {
    if (!coerceBoolean(this.showDateSelect())) return false;
    const precision = classifyStoreDate(this.storeDate());
    return precision === 'full' || precision === 'none';   // 'none' includes empty: pick a fresh date
  });
  public locale = input('de-ch'); // mandatory locale for the input field, used for formatting
  public mask = input<MaskitoOptions>(ChAnyDate);

  /**
   * Accept a partial date: a year without a day ('19850000') or a birthday without a
   * year ('00000415'). Person dateOfBirth/dateOfDeath only — every other date field
   * must stay strict. Overrides `mask` with ChPartialDate while on.
   */
  public allowPartial = input(false);
  protected isPartialAllowed = computed(() => coerceBoolean(this.allowPartial()));
  protected effectiveMask = computed(() => this.isPartialAllowed() ? ChPartialDate : this.mask());

  protected viewDateI18n = computed(() => ({
    name: this.i18n().name,
    label: this.i18n().label,
    placeholder: this.i18n().placeholder
  } as ViewDateInputI18n));

  protected isoDate = computed(() => {
    const store = this.storeDate();
    if (classifyStoreDate(store) !== 'full') return '';   // the picker needs a real date
    return convertDateFormatToString(store, DateFormat.StoreDate, DateFormat.IsoDate, false) || '';
  });

  // passing constants to the template
  protected isoFormat = DateFormat.IsoDate;

  protected updateStoreDate(date: string, format: DateFormat): void {
    this.storeDate.set(convertDateFormatToString(date, format, DateFormat.StoreDate, false));
  }

  // Sync viewDate → storeDate (on change)
  protected onViewDateChange(view: string) {
    if (view.length === 0) {
      this.storeDate.set('');
      return;
    }
    // a complete date: 10 chars, dd.MM.yyyy
    if (view.length === 10 && view.includes('.')) {
      const store = convertDateFormatToString(view, DateFormat.ViewDate, DateFormat.StoreDate, false);
      if (store) {   // store will be '' if conversion failed
        this.storeDate.set(store);
      }
      return;
    }
    if (!this.isPartialAllowed()) return;   // incomplete → user still typing

    // '1985' or '15.04.' — parsePartialViewDate returns '' for a fragment
    const partial = parsePartialViewDate(view);
    if (partial) {
      this.storeDate.set(partial);
    }
  }
}
