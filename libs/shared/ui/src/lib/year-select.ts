import { Component, computed, input, model } from '@angular/core';
import { IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { coerceBoolean, getYear, YEAR_ROLLING_WINDOW } from '@okr/shared-util-core';
import { TranslatePipe } from '@okr/shared-i18n';

@Component({
  selector: 'okr-year-select',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonSelect, IonSelectOption, IonLabel
  ],
  styles: [`
    /* The select stretches its value across the full column, leaving the year marooned
       far from its caret. Shrink it to its content and centre the pair in the column. */
    ion-select {
      width: fit-content;
      /* wide enough for 'Alle Jahre' + caret: below this the select clips its own value
         AND the popover it opens (Ionic sizes the option list from the select's width) */
      min-width: 140px;
      margin-inline: auto;
      --padding-start: 0;
      --padding-end: 0;
    }
    ion-select::part(label) { flex: none; }
    ion-select::part(icon) { margin-inline-start: 4px; }
  `],
  template: `
  @if(isReadOnly()) {
    <ion-label>{{ label() }}</ion-label>
  } @else {
    <ion-select
      [value]="selectedYear()"
      (ionChange)="selectedYear.set($event.detail.value)"
      label="{{ label() | translate | async }}"
      label-placement="floating"
      interface="popover"
      [compareWith]="compareWith">
      @if(shouldShowRollingWindow()) {
        <ion-select-option [value]="rollingWindow">{{ '@upcomingMonths' | translate | async }}</ion-select-option>
      }
      @if(shouldShowAllYears()) {
        <ion-select-option [value]="99">{{ '@allYears' | translate | async }}</ion-select-option>
      }
      @for(year of years(); track year) {
        <ion-select-option [value]=year>{{ year }}</ion-select-option>
      }
    </ion-select>
  }
  `
})
export class YearSelect {
  // inputs
  public selectedYear = model<number>(getYear());   // default is current year
  public label = input('@year');
  public showAllYears = input(false); // if true, all years are shown
  public showRollingWindow = input(false); // if true, the rolling window 'Demnächst' (YEAR_ROLLING_WINDOW) is offered
  public readOnly = input.required<boolean>();
  public years = input.required<number[]>();    // default are the last 8 years including the current year

  // coerced boolean inputs
  protected shouldShowAllYears = computed(() => coerceBoolean(this.showAllYears()));
  protected shouldShowRollingWindow = computed(() => coerceBoolean(this.showRollingWindow()));
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly rollingWindow = YEAR_ROLLING_WINDOW;

  /**
   * Compare two Years.
   * Return true if they are the same.
   */
  compareWith(year1: number, year2: number): boolean {
    return (year1 === year2);
  }
}

