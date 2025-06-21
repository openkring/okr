
import { Component, computed, inject, input, model, output } from '@angular/core';
import { IonIcon, IonItem, ModalController } from '@ionic/angular/standalone';
import { MaskitoElementPredicate, MaskitoOptions } from '@maskito/core';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { SvgIconPipe } from '@bk2/shared/pipes';
import { convertDateFormatToString, DateFormat, getTodayStr } from '@bk2/shared/util';
import { ChAnyDate, DATE_LENGTH, InputMode } from '@bk2/shared/config';

import { DateSelectModalComponent } from './date-select.modal';
import { ViewDateInputComponent } from './viewdate-input.component';

@Component({
  selector: 'bk-date-input',
  imports: [
    SvgIconPipe,
    ViewDateInputComponent,
    IonItem, IonIcon
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-item lines="none">
      @if(showDateSelect() && !readOnly()) {
        <ion-icon  src="{{'calendar' | svgIcon }}" slot="start" (click)="selectDate()" />
      }
      <bk-viewdate-input (changed)="onChange($event)"
        [name]="name()" 
        [viewDate]="viewDate()"
        [readOnly]="readOnly()"
        [clearInput]="clearInput()"
        [inputMode]="inputMode()"
        [maxLength]="maxLength()"
        [autocomplete]="autocomplete()"
        [mask]="mask()"
        [showHelper]="showHelper()"
       />
    </ion-item>
  `
})
export class DateInputComponent {
  protected modalController = inject(ModalController);

  // storeDate is the interface to the parent components (forms), because it is how the date is stored in the database.
  // for the DateSelection component, we need to convert into isoDate format.
  // for the ion-input field, we need to convert into viewDate format (using the view-date-input component).
  // optional date in StoreDate format (yyyyMMdd); default is today
  public storeDate = model(getTodayStr(DateFormat.StoreDate));
  public name = input.required<string>(); // mandatory name of the input field
  public readOnly = input(false); // if true, the input field is read-only
  public clearInput = input(true); // show an icon to clear the input field
  public inputMode = input<InputMode>('numeric'); // A hint to the browser for which keyboard to display.
  public maxLength = input(DATE_LENGTH);
  public autocomplete = input('off'); // can be set to bday for birth date
  public mask = input<MaskitoOptions>(ChAnyDate);
  public showHelper = input(false);
  public showDateSelect = input(true);
  public locale = input('de-ch'); // mandatory locale for the input field, used for formatting

  protected viewDate = computed(() => convertDateFormatToString(this.storeDate(), DateFormat.StoreDate, DateFormat.ViewDate, false));
  // the date in the calendar must be in ISO format (used as input into datetime picker), it may not be empty, instead default is today
  protected isoDate = computed(() => convertDateFormatToString(this.storeDate(), DateFormat.StoreDate, DateFormat.IsoDate, false));
  public changed = output<string>(); // output event when the value changes

  protected async selectDate(): Promise<void> {
    if (this.readOnly() === true) return;
    const _modal = await this.modalController.create({
      component: DateSelectModalComponent,
      cssClass: 'date-modal',
      componentProps: {
        isoDate: this.isoDate(),
        locale: this.locale(),
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (typeof(data) === 'string') {
        this.storeDate.set(convertDateFormatToString(data.substring(0,10), DateFormat.IsoDate, DateFormat.StoreDate, false));
        this.changed.emit(this.storeDate());
      } else {
        console.error('DateInputComponent.selectDate: type of returned data is not string: ', data);
      }
    }
  }

  protected onChange(viewDate: string): void {
    this.storeDate.set(convertDateFormatToString(viewDate, DateFormat.ViewDate, DateFormat.StoreDate, false));
    this.changed.emit(this.storeDate());
  }

  protected readonly maskPredicate: MaskitoElementPredicate = async (el: HTMLElement) => (el as HTMLIonInputElement).getInputElement();
}
