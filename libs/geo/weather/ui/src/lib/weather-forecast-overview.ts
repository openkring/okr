import { Component, computed, input } from '@angular/core';

import { WeatherModel } from '@okr/shared-models';
import { niceScale } from '@okr/weather-util';

import { hostWidth } from './host-width';
import { WeatherDayTile } from './weather-day-tile';

/** One temperature sample: its value, the spread around it, and its x position in px. */
interface CurvePoint { x: number; t: number; lo: number; hi: number; }

/**
 * `forecast_overview` — N days as tiles plus a temperature curve across the whole range.
 *
 * The curve is plain SVG rather than a charting library: no tooltips or zoom, so echarts would
 * be several hundred kilobytes for a line. It is drawn in real pixels (see `hostWidth`) so the
 * °C labels stay legible, and each day gets the same width as its tile above, so the day
 * dividers line up with the tiles.
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
    svg { display: block; margin-top: 6px; width: 100%; overflow: visible; }
    .grid { stroke: var(--ion-color-step-150, #e3e7ee); stroke-width: 1; }
    .divider { stroke: var(--ion-color-step-250, #c8ced8); stroke-width: 1; }
    .band { fill: var(--ion-color-danger, #c5000f); opacity: 0.14; }
    .line { fill: none; stroke: var(--ion-color-danger, #c5000f); stroke-width: 2.6; stroke-linejoin: round; stroke-linecap: round; }
    /* labels sit on the plot; the halo keeps them readable where the curve crosses them */
    .axis {
      font-size: 11px; fill: var(--ion-color-medium, #5f5f5f); font-variant-numeric: tabular-nums;
      paint-order: stroke; stroke: var(--ion-card-background, #fff); stroke-width: 3px; stroke-linejoin: round;
    }
    .axis.unit { fill: var(--ion-color-danger, #c5000f); font-weight: 600; }
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
          <svg [attr.viewBox]="'0 0 ' + W() + ' ' + H" [attr.height]="H">
            @for (t of ticks(); track t.v) { <path class="grid" [attr.d]="'M0 ' + t.y + 'H' + W()" /> }
            @for (x of dayDividers(); track x) { <path class="divider" [attr.d]="'M' + x + ' ' + TOP + 'V' + BOTTOM" /> }
            <path class="band" [attr.d]="band()" />
            <path class="line" [attr.d]="curve()" />
            @for (t of ticks(); track t.v) {
              <text class="axis" x="2" [attr.y]="t.y - 3">{{ t.v }}°</text>
            }
            <text class="axis unit" x="2" y="11">°C</text>
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

  /** Chart height and the plot area inside it (room above for the unit label). */
  protected readonly H = 150;
  protected readonly TOP = 22;
  protected readonly BOTTOM = 142;

  private readonly measured = hostWidth();
  protected W = computed(() => Math.max(240, Math.round(this.measured() || 640)));

  /**
   * The hourly temperatures of every day, each day spread over its own column. Days whose
   * hourly data is missing (an archived document, a provider hiccup) fall back to their min
   * and max, so the line stays continuous instead of breaking into segments.
   */
  private points = computed<CurvePoint[]>(() => {
    const days = this.days();
    const col = this.W() / Math.max(1, days.length);
    return days.flatMap((d, di) => {
      const hours = d.hourly?.length
        ? d.hourly.map((h) => ({ t: h.temp, lo: num(h.tempMin, h.temp), hi: num(h.tempMax, h.temp) }))
        : [d.daily.tempMin, d.daily.tempMax].map((t) => ({ t, lo: t, hi: t }));
      return hours.map((p, j) => ({ ...p, x: round1((di + (j + 0.5) / hours.length) * col) }));
    });
  });

  private scale = computed(() => {
    const ps = this.points();
    return niceScale(Math.min(...ps.map((p) => p.lo)), Math.max(...ps.map((p) => p.hi)), 4, 4);
  });

  private y(v: number): number {
    const s = this.scale();
    return round1(this.BOTTOM - ((v - s.min) / (s.max - s.min || 1)) * (this.BOTTOM - this.TOP));
  }

  protected ticks = computed(() => this.scale().ticks.map((v) => ({ v, y: this.y(v) })));

  protected curve = computed(() => {
    const ps = this.points();
    return ps.length > 1 ? 'M' + ps.map((p) => `${p.x},${this.y(p.t)}`).join(' L') : '';
  });

  /** Forecast spread (tempMin … tempMax per hour) as a closed ring around the line. */
  protected band = computed(() => {
    const ps = this.points();
    if (ps.length < 2) return '';
    const fwd = ps.map((p) => `${p.x},${this.y(p.hi)}`);
    const back = [...ps].reverse().map((p) => `${p.x},${this.y(p.lo)}`);
    return `M${fwd.join(' L')} L${back.join(' L')} Z`;
  });

  /** Where one day's column ends and the next begins — under the gaps between the tiles. */
  protected dayDividers = computed(() => {
    const n = this.days().length;
    const col = this.W() / Math.max(1, n);
    return Array.from({ length: Math.max(0, n - 1) }, (_, i) => round1((i + 1) * col));
  });
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Firestore reads skip model defaults: fields added later are undefined on older documents. */
function num(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
