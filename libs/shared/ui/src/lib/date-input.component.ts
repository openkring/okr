
import { Component, computed, input, linkedSignal, model, viewChild } from '@angular/core';
import { IonIcon, IonItem, IonNote } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';
import { AsyncPipe } from '@angular/common';
import { MaskitoOptions } from '@maskito/core';

import { DATE_LENGTH, InputMode } from '@bk2/shared-constants';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean, convertDateFormatToString, DateFormat, getTodayStr } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';
import { DatePickerModalComponent } from '@bk2/shared-ui';
import { ChAnyDate } from '@bk2/shared-config';

import { ViewDateInputComponent } from './viewdate-input.component';

@Component({
  selector: 'bk-date-input',
  standalone: true,
  imports: [
    SvgIconPipe, TranslatePipe, AsyncPipe,
    ViewDateInputComponent, DatePickerModalComponent,
    IonItem, IonIcon, IonNote
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`
    ion-item.helper { --min-height: 0; }
    bk-viewdate-input { width: 100%; }
  `],
  template: `
    <ion-item lines="none">
      @if(shouldShowDateSelect() && !isReadOnly()) {
        <ion-icon src="{{'calendar' | svgIcon }}" slot="start" (click)="datePicker.open()" />
      }
      <bk-viewdate-input
        [viewDate]="viewDate()"
        (viewDateChange)="onViewDateChange($event)"
        [name]="name()" 
        [readOnly]="isReadOnly()"
        [clearInput]="shouldShowClearInput()"
        [inputMode]="inputMode()"
        [maxLength]="maxLength()"
        [mask]="mask()"
        [autocomplete]="autocomplete()"
       />
    </ion-item>

    <bk-date-picker-modal #datePicker
      [isoDate]="isoDate()"
      (dateSelected)="updateStoreDate($event, isoFormat)"
    />

    @if(shouldShowHelper()) {
      <ion-item lines="none" class="helper">
        <ion-note>{{'@input.' + name() + '.helper' | translate | async}}</ion-note>
      </ion-item>
    }
  `
})
export class DateInputComponent {
  protected datePickerModal = viewChild.required<DatePickerModalComponent>(DatePickerModalComponent);

  // storeDate is the interface to the parent components (forms), because it is how the date is stored in the database.
  // for the DateSelection component, we need to convert into isoDate format.
  // for the ion-input field, we need to convert into viewDate format (using the view-date-input component).
  // optional date in StoreDate format (yyyyMMdd); default is today
  public storeDate = model(getTodayStr(DateFormat.StoreDate));

  protected viewDate = linkedSignal(() => {
    const store = this.storeDate();
    if (!store || store.length !== 8) return '';     // make sure that we only send valid dates to date-fns/format

    const converted = convertDateFormatToString(
      store,
      DateFormat.StoreDate,
      DateFormat.ViewDate,
      false
    );
    return converted ?? '';
  });  

  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public clearInput = input(true); // show an icon to clear the input field
  protected shouldShowClearInput = computed(() => coerceBoolean(this.clearInput()));
  public inputMode = input<InputMode>('numeric'); // A hint to the browser for which keyboard to display.
  public maxLength = input(DATE_LENGTH);
  public autocomplete = input('off'); // can be set to bday for birth date
  public showHelper = input(false);
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  public showDateSelect = input(true);
  protected shouldShowDateSelect = computed(() => coerceBoolean(this.showDateSelect()));
  public locale = input('de-ch'); // mandatory locale for the input field, used for formatting
  public header = input('@general.operation.select.date');
  public mask = input<MaskitoOptions>(ChAnyDate);

  protected isoDate = computed(() => { 
    const store = this.storeDate();
    if (!store || store.length !== 8) return '';    // make sure that we only send valid dates to date-fns/format

    const iso = convertDateFormatToString(store, DateFormat.StoreDate, DateFormat.IsoDate, false);
    return iso || '';
  });

  // passing constants to the template
  protected isoFormat = DateFormat.IsoDate;

  protected updateStoreDate(date: string, format: DateFormat): void {
    this.storeDate.set(convertDateFormatToString(date, format, DateFormat.StoreDate, false));
  }

  // Sync viewDate → storeDate (on change)
  protected onViewDateChange(view: string) {
    // Only convert if the view date is complete (10 chars: dd.MM.yyyy) or empty
    if (view.length === 0) {
      this.storeDate.set('');
    } else
    if (view?.length === 10 && view.includes('.')) {
      const store = convertDateFormatToString(view, DateFormat.ViewDate, DateFormat.StoreDate, false);
      if (store) {  // store will be '' if conversion failed
        this.storeDate.set(store);
      }
    }
    // If incomplete → do nothing (user still typing)
  }
}
