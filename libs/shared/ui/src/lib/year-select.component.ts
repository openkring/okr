import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { coerceBoolean, getYear } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-year-select',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonSelect, IonSelectOption, IonLabel
  ],
  template: `
  @if(isReadOnly()) {
    <ion-label>{{ label() | translate | async }}</ion-label>
  } @else {
    <ion-select
      [value]="selectedYear()"
      (ionChange)="selectedYear.set($event.detail.value)"
      label="{{ label() | translate | async }}"
      label-placement="floating"
      interface="popover"
      [compareWith]="compareWith">
      @if(shouldShowAllYears()) {
        <ion-select-option value=99>{{ '@general.util.allYears' | translate | async }}</ion-select-option>
      }
      @for(year of years(); track year) {
        <ion-select-option [value]=year>{{ year }}</ion-select-option>
      }
    </ion-select>
  }
  `
})
export class YearSelectComponent {
  // inputs
  public selectedYear = model<number>(getYear());   // default is current year
  public label = input('@general.util.year');
  public showAllYears = input(false); // if true, all years are shown
  public readOnly = input.required<boolean>();
  public years = input.required<number[]>();    // default are the last 8 years including the current year

  // coerced boolean inputs
  protected shouldShowAllYears = computed(() => coerceBoolean(this.showAllYears()));
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  /**
   * Compare two Years.
   * Return true if they are the same.
   */
  compareWith(year1: number, year2: number): boolean {
    return (year1 === year2);
  }
}

