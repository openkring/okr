import { Component, input, model, output } from '@angular/core';
import { IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { TranslatePipe } from '@bk2/shared/i18n';
import { AsyncPipe } from '@angular/common';
import { getYear, getYearList } from '@bk2/shared/util';

@Component({
  selector: 'bk-year-select',
  imports: [
    TranslatePipe, AsyncPipe,
    IonSelect, IonSelectOption, IonLabel
  ],
  template: `
  @if(readOnly()) {
    <ion-label>{{ label() | translate | async }}</ion-label>
  } @else {
    <ion-select (ionChange)="selectYear($event.detail.value)"
      label="{{ label() | translate | async }}"
      label-placement="floating"
      interface="popover"
      [value]="selectedYear()"
      [compareWith]="compareWith">
      @if(showAllYears()) {
        <ion-select-option value="99">{{ '@general.util.allYears' | translate | async }}</ion-select-option>
      }
      @for(year of years; track year) {
        <ion-select-option [value]="year">{{ year }}</ion-select-option>
      }
    </ion-select>
  }
  `
})
export class YearSelectComponent {
  public selectedYear = model<number>(getYear());   // default is current year
  public label = input('@general.util.year');
  public showAllYears = input(false); // if true, all years are shown
  public readOnly = input(false); // if true, the selected category is shown as a ready-only text
  protected years = getYearList();    // default are the last 8 years including the current year
  public changed = output<number>();

  /**
   * Compare two Years.
   * Return true if they are the same.
   */
  compareWith(year1: number, year2: number): boolean {
    return (year1 === year2);
  }

  selectYear(year: number): void {
    this.selectedYear.set(year);
    this.changed.emit(year);
  }
}

