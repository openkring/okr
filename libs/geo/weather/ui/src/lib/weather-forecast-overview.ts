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
    .divider { stroke: var(--ion-color-step-250, #c8ced8); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .band { fill: none; stroke: var(--ion-color-danger, #c5000f); stroke-opacity: 0.16; stroke-width: 15; stroke-linecap: round; }
    .line { fill: none; stroke: var(--ion-color-danger, #c5000f); stroke-width: 2.6; stroke-linecap: round; }
    .empty { padding: 20px 0; color: var(--ion-color-medium, #5f5f5f); font-size: 14px; }
  `],
  template: `
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
            @if (dayDividers()) { <path class="divider" [attr.d]="dayDividers()" /> }
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
  public orientation = input<'horizontal' | 'vertical'>('horizontal');
  public emptyLabel = input('');

  protected readonly curveHeight = 130;

  /**
   * The curve runs over the hourly temperatures of every day shown. Days whose hourly data
   * is missing (an archived document, a provider hiccup) fall back to their min and max, so
   * the line stays continuous instead of breaking into segments.
   */
  private points = computed(() => this.days().map((d) =>
    d.hourly?.length ? d.hourly.map((h) => h.temp) : [d.daily.tempMin, d.daily.tempMax]));

  protected curve = computed(() => {
    const temps = this.points().flat();
    return temps.length > 1 ? buildSparklinePath(temps, 640, this.curveHeight, 20) : '';
  });

  /**
   * A vertical line where one day ends and the next begins, so the curve can be read against
   * the tiles above it. Placed halfway between the last point of a day and the first of the
   * next — the same x mapping as `buildSparklinePath` (i / (n - 1)).
   */
  protected dayDividers = computed(() => {
    const counts = this.points().map((p) => p.length);
    const n = counts.reduce((a, b) => a + b, 0);
    if (n < 2 || counts.length < 2) return '';
    let start = 0;
    return counts.slice(0, -1).map((c) => {
      start += c;
      const x = Math.round(((start - 0.5) / (n - 1)) * 640 * 10) / 10;
      return `M${x} 0V${this.curveHeight}`;
    }).join('');
  });
}
