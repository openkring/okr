import { Component, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';

import { WeatherModel } from '@okr/shared-models';
import { WeekdayPipe } from '@okr/shared-pipes';
import { TranslatePipe } from '@okr/shared-i18n';
import { formatPrecipitation, formatPrecipitationRange, formatTemp } from '@okr/weather-util';

import { WeatherIcon } from './weather-icon';

/** `forecast_table` — one row per day with temperatures and the precipitation range. */
@Component({
  selector: 'okr-weather-forecast-table',
  standalone: true,
  imports: [WeatherIcon, WeekdayPipe, TranslatePipe, AsyncPipe],
  styles: [`
    :host { display: block; }
    .row {
      display: flex; align-items: center; gap: 12px; padding: 11px 16px;
      border-top: 1px solid var(--ion-color-step-150, #e3e7ee);
    }
    .row:first-child { border-top: none; }
    .row.today {
      border-left: 3px solid var(--ion-color-primary, #009D53);
      background: var(--ion-color-step-100, #f2f4f8);
    }
    .day { font-size: 17px; font-weight: 500; width: 74px; color: var(--ion-color-medium, #5f5f5f); }
    .row.today .day { font-weight: 600; color: var(--ion-text-color, #2f2f2f); }
    .temps { display: flex; gap: 5px; }
    .t {
      min-width: 46px; padding: 5px 0; text-align: center; border-radius: 6px;
      background: var(--ion-color-step-150, #e9edf3); font-size: 16px;
    }
    .t.min { color: var(--ion-color-medium, #5f5f5f); }
    .t.max { font-weight: 500; }
    .precip { margin-left: auto; text-align: right; min-width: 92px; }
    .precip .value { font-size: 16px; font-weight: 500; }
    .precip .value.wet { font-weight: 600; color: var(--ion-color-tertiary, #00A2FF); }
    .precip .range { font-size: 12px; color: var(--ion-color-medium, #5f5f5f); }
    .empty { padding: 20px 16px; color: var(--ion-color-medium, #5f5f5f); font-size: 14px; }
  `],
  template: `
    @for (day of days(); track day.okey; let first = $first) {
      <div class="row" [class.today]="first && showToday()">
        <div class="day">
          @if (first && showToday()) { {{ todayLabel() }} }
          @else { {{ day.date | weekday | translate | async }} }
        </div>
        <okr-weather-icon [code]="day.daily.code" [size]="40" />
        <div class="temps">
          <span class="t min">{{ temp(day.daily.tempMin) }}</span>
          <span class="t max">{{ temp(day.daily.tempMax) }}</span>
        </div>
        <div class="precip">
          <div class="value" [class.wet]="day.daily.precipitation >= 1">{{ precip(day.daily.precipitation) }}</div>
          <div class="range">{{ range(day.daily.precipitationMin, day.daily.precipitationMax) }}</div>
        </div>
      </div>
    } @empty {
      <div class="empty">{{ emptyLabel() }}</div>
    }
  `
})
export class WeatherForecastTable {
  public days = input.required<WeatherModel[]>();
  /** Label the first row "today" — false when the table shows an archived range. */
  public showToday = input(true);
  public todayLabel = input('');
  public emptyLabel = input('');

  protected temp = formatTemp;
  protected precip = formatPrecipitation;
  protected range = formatPrecipitationRange;
}
