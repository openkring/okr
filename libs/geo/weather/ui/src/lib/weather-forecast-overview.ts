import { Component, computed, input } from '@angular/core';

import { WeatherModel } from '@okr/shared-models';
import { buildSparklinePath } from '@okr/weather-util';

import { WeatherDayTile } from './weather-day-tile';

/**
 * `forecast_overview` — N days as tiles plus a temperature sparkline across the whole range.
 *
 * The curve is a plain SVG polyline rather than a charting library: it carries no axes,
 * tooltips or zoom, so echarts would be several hundred kilobytes for a shape.
 */
@Component({
  selector: 'okr-weather-forecast-overview',
  standalone: true,
  imports: [WeatherDayTile],
  styles: [`
    :host { display: block; }
    .title { font-size: 22px; font-weight: 600; letter-spacing: -0.3px; margin-bottom: 10px; }
    .days { display: grid; gap: 4px; }
    .rows { display: flex; flex-direction: column; }
    .row {
      display: flex; align-items: center; gap: 14px; padding: 9px 0;
      border-bottom: 1px solid var(--ion-color-step-150, #e3e7ee);
    }
    .row:last-child { border-bottom: none; }
    .row .caption { width: 40px; font-size: 16px; font-weight: 600; color: var(--ion-color-medium, #5f5f5f); }
    svg { display: block; margin-top: 6px; width: 100%; }
    .grid { stroke: var(--ion-color-step-150, #e3e7ee); stroke-width: 1; }
    .band { fill: none; stroke: var(--ion-color-danger, #c5000f); stroke-opacity: 0.16; stroke-width: 15; stroke-linecap: round; }
    .line { fill: none; stroke: var(--ion-color-danger, #c5000f); stroke-width: 2.6; stroke-linecap: round; }
    .empty { padding: 20px 0; color: var(--ion-color-medium, #5f5f5f); font-size: 14px; }
  `],
  template: `
    @if (locationName()) { <div class="title">{{ locationName() }}</div> }

    @if (days().length) {
      @if (orientation() === 'vertical') {
        <div class="rows">
          @for (day of days(); track day.okey) {
            <div class="row">
              <okr-weather-day-tile [daily]="day.daily" [date]="day.date" [iconSize]="38" [plain]="true" />
            </div>
          }
        </div>
      } @else {
        <div class="days" [style.grid-template-columns]="'repeat(' + days().length + ', minmax(0, 1fr))'">
          @for (day of days(); track day.okey) {
            <okr-weather-day-tile [daily]="day.daily" [date]="day.date" [iconSize]="46" [plain]="true" />
          }
        </div>

        @if (curve()) {
          <svg [attr.viewBox]="'0 0 640 ' + curveHeight" [attr.height]="curveHeight" preserveAspectRatio="none">
            <path class="grid" d="M0 30h640M0 70h640M0 110h640" />
            <path class="band" [attr.d]="curve()" />
            <path class="line" [attr.d]="curve()" />
          </svg>
        }
      }
    } @else {
      <div class="empty">{{ emptyLabel() }}</div>
    }
  `
})
export class WeatherForecastOverview {
  public days = input.required<WeatherModel[]>();
  public locationName = input('');
  public orientation = input<'horizontal' | 'vertical'>('horizontal');
  public emptyLabel = input('');

  protected readonly curveHeight = 130;

  /**
   * The curve runs over the hourly temperatures of every day shown. Days whose hourly data
   * is missing (an archived document, a provider hiccup) fall back to their min and max, so
   * the line stays continuous instead of breaking into segments.
   */
  protected curve = computed(() => {
    const temps = this.days().flatMap((d) =>
      d.hourly?.length ? d.hourly.map((h) => h.temp) : [d.daily.tempMin, d.daily.tempMax]
    );
    return temps.length > 1 ? buildSparklinePath(temps, 640, this.curveHeight, 20) : '';
  });
}
