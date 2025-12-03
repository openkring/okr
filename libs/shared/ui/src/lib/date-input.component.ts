
import { Component, computed, input, model, output, viewChild } from '@angular/core';
import { IonIcon, IonItem } from '@ionic/angular/standalone';
import { MaskitoElementPredicate, MaskitoOptions } from '@maskito/core';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { ChAnyDate } from '@bk2/shared-config';
import { DATE_LENGTH, InputMode } from '@bk2/shared-constants';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { coerceBoolean, convertDateFormatToString, DateFormat, getTodayStr } from '@bk2/shared-util-core';

import { ViewDateInputComponent } from './viewdate-input.component';
import { DatePickerModalComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-date-input',
  standalone: true,
  imports: [
    SvgIconPipe,
    ViewDateInputComponent, DatePickerModalComponent,
    IonItem, IonIcon
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
      @if(shouldShowDateSelect() && !isReadOnly()) {
        <ion-icon src="{{'calendar' | svgIcon }}" slot="start" (click)="datePicker.open()" />
      }
      <bk-viewdate-input (changed)="onChange($event)"
        [name]="name()" 
        [viewDate]="viewDate()"
        [readOnly]="isReadOnly()"
        [clearInput]="shouldShowClearInput()"
        [inputMode]="inputMode()"
        [maxLength]="maxLength()"
        [autocomplete]="autocomplete()"
        [mask]="mask()"
        [showHelper]="shouldShowHelper()"
       />
    </ion-item>

    <bk-date-picker-modal #datePicker [isoDate]="isoDate()" (dateSelected)="onDateSelected($event)" />
  `
})
export class DateInputComponent {
  protected datePickerModal = viewChild.required<DatePickerModalComponent>(DatePickerModalComponent);

  // storeDate is the interface to the parent components (forms), because it is how the date is stored in the database.
  // for the DateSelection component, we need to convert into isoDate format.
  // for the ion-input field, we need to convert into viewDate format (using the view-date-input component).
  // optional date in StoreDate format (yyyyMMdd); default is today
  public storeDate = model(getTodayStr(DateFormat.StoreDate));
  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public clearInput = input(true); // show an icon to clear the input field
  protected shouldShowClearInput = computed(() => coerceBoolean(this.clearInput()));
  public inputMode = input<InputMode>('numeric'); // A hint to the browser for which keyboard to display.
  public maxLength = input(DATE_LENGTH);
  public autocomplete = input('off'); // can be set to bday for birth date
  public mask = input<MaskitoOptions>(ChAnyDate);
  public showHelper = input(false);
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  public showDateSelect = input(true);
  protected shouldShowDateSelect = computed(() => coerceBoolean(this.showDateSelect()));
  public locale = input('de-ch'); // mandatory locale for the input field, used for formatting
  public header = input('@general.operation.select.date');

  protected viewDate = computed(() => convertDateFormatToString(this.storeDate(), DateFormat.StoreDate, DateFormat.ViewDate, false));
  protected isoDate = computed(() => this.getIsoDate(this.storeDate()));
  public changed = output<string>(); // output event when the value changes

  protected onChange(viewDate: string): void {
    this.storeDate.set(convertDateFormatToString(viewDate, DateFormat.ViewDate, DateFormat.StoreDate, false));
    this.changed.emit(this.storeDate());
  }

  // the date must be in ISO format (used as input into datetime picker), it may not be empty, instead default is today
  private getIsoDate(storeDate: string): string {
    let isoDate = convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.IsoDate, false);
    return isoDate || getTodayStr(DateFormat.IsoDate);
  }

  protected onDateSelected(isoDate: string): void {
    this.storeDate.set(
      convertDateFormatToString(isoDate, DateFormat.IsoDate, DateFormat.StoreDate, false)
    );
    this.changed.emit(this.storeDate());
  }

  protected readonly maskPredicate: MaskitoElementPredicate = async (el: HTMLElement) => ((el as unknown) as HTMLIonInputElement).getInputElement();
}
