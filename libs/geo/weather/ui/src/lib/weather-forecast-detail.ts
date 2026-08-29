import { Component, computed, input } from '@angular/core';

import { WeatherHour, WeatherModel } from '@okr/shared-models';

import { WeatherIcon } from './weather-icon';

/** One hour plus the x position it occupies in the charts. */
interface PlottedHour extends WeatherHour { x: number; dayIndex: number; }

/**
 * `forecast_detail` — the full local forecast: an hourly icon strip with precipitation
 * probability, a temperature curve with its uncertainty band and precipitation bars,
 * sunshine duration, and wind with gusts.
 *
 * All three charts are plain SVG. They have no tooltips, no zoom and no legend, so a
 * charting library would add hundreds of kilobytes to the eager bundle for a handful of
 * polylines and rectangles.
 */
@Component({
  selector: 'okr-weather-forecast-detail',
  standalone: true,
  imports: [WeatherIcon],
  styles: [`
    :host { display: block; }
    .head { text-align: center; margin-bottom: 14px; }
    .head .title { font-size: 21px; font-weight: 600; letter-spacing: -0.3px; }
    .head .place { font-size: 14px; color: var(--ion-color-medium, #5f5f5f); margin-top: 2px; }
    .tag {
      display: inline-block; font-size: 12px; font-weight: 600; border-radius: 5px; padding: 4px 9px;
      color: var(--ion-color-secondary, #014da2); background: var(--ion-color-step-100, #f2f4f8);
      margin-bottom: 6px;
    }
    .strip { display: grid; gap: 0; margin-bottom: 12px; }
    .strip .cell { display: flex; flex-direction: column; align-items: center; gap: 3px; }
    .strip .prob { font-size: 10.5px; color: var(--ion-color-medium, #5f5f5f); }
    .section-title { font-size: 16px; font-weight: 600; margin: 20px 0 8px; }
    .days { display: flex; margin-top: 2px; }
    .days > div { flex: 1; text-align: center; font-size: 13.5px; font-weight: 600; }
    svg { display: block; width: 100%; }
    .grid { stroke: var(--ion-color-step-150, #e3e7ee); stroke-width: 1; }
    .band { fill: none; stroke: var(--ion-color-danger, #c5000f); stroke-opacity: 0.16; stroke-width: 14; stroke-linejoin: round; stroke-linecap: round; }
    .temp { fill: none; stroke: var(--ion-color-danger, #c5000f); stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; }
    .bar { fill: var(--ion-color-tertiary, #00A2FF); }
    .sun { fill: var(--ion-color-warning, #ffc409); }
    .wind { fill: none; stroke: var(--ion-color-secondary, #014da2); stroke-width: 2.4; stroke-linejoin: round; }
    .gust { fill: none; stroke: var(--ion-color-tertiary, #00A2FF); stroke-width: 2; stroke-linejoin: round; }
    .gustband { fill: var(--ion-color-tertiary, #00A2FF); opacity: 0.16; }
    .axis { font-size: 11px; fill: var(--ion-color-medium, #5f5f5f); }
    .empty { padding: 20px 0; color: var(--ion-color-medium, #5f5f5f); font-size: 14px; }
  `],
  template: `
    <div class="head">
      <div class="title">{{ titleLabel() }}</div>
      @if (placeLabel()) { <div class="place">{{ placeLabel() }}</div> }
    </div>

    @if (hours().length > 1) {
      <div class="tag">{{ probabilityLabel() }}</div>
      <div class="strip" [style.grid-template-columns]="'repeat(' + stripHours().length + ', minmax(0, 1fr))'">
        @for (h of stripHours(); track h.x) {
          <div class="cell">
            <okr-weather-icon [code]="h.code" [isDay]="h.isDay" [size]="34" />
            <div class="prob">{{ h.precipitationProbability }}%</div>
          </div>
        }
      </div>

      <svg [attr.viewBox]="'0 0 ' + W + ' 236'" height="236">
        <path class="grid" [attr.d]="hGrid(30, 70, 110, 150, 190)" />
        @for (x of dayBoundaries(); track x) { <path class="grid" [attr.d]="'M' + x + ' 12V210'" /> }
        <path class="band" [attr.d]="tempPath()" />
        <path class="temp" [attr.d]="tempPath()" />
        @for (b of precipBars(); track b.x) {
          <rect class="bar" [attr.x]="b.x - 3" [attr.y]="b.y" width="6" [attr.height]="b.h" />
        }
        <text class="axis" x="4" y="26">°C</text>
      </svg>
      <div class="days">@for (d of dayLabels(); track d) { <div>{{ d }}</div> }</div>

      <div class="section-title">{{ sunshineLabel() }}</div>
      <svg [attr.viewBox]="'0 0 ' + W + ' 100'" height="100">
        <path class="grid" [attr.d]="hGrid(10, 50, 90)" />
        @for (b of sunBars(); track b.x) {
          <rect class="sun" [attr.x]="b.x - 4" [attr.y]="b.y" width="8" [attr.height]="b.h" rx="1" />
        }
        <text class="axis" x="4" y="24">min/h</text>
      </svg>
      <div class="days">@for (d of dayLabels(); track d) { <div>{{ d }}</div> }</div>

      <div class="section-title">{{ windLabel() }}</div>
      <svg [attr.viewBox]="'0 0 ' + W + ' 130'" height="130">
        <path class="grid" [attr.d]="hGrid(15, 67, 119)" />
        <path class="gustband" [attr.d]="gustBand()" />
        <path class="gust" [attr.d]="gustPath()" />
        <path class="wind" [attr.d]="windPath()" />
        <text class="axis" x="4" y="30">km/h</text>
      </svg>
      <div class="days">@for (d of dayLabels(); track d) { <div>{{ d }}</div> }</div>
    } @else {
      <div class="empty">{{ emptyLabel() }}</div>
    }
  `
})
export class WeatherForecastDetail {
  public days = input.required<WeatherModel[]>();
  /** Already-formatted weekday + date per day, in the same order as `days`. */
  public dayLabels = input<string[]>([]);
  public titleLabel = input('');
  public placeLabel = input('');
  public probabilityLabel = input('');
  public sunshineLabel = input('');
  public windLabel = input('');
  public emptyLabel = input('');

  protected readonly W = 1160;

  /** Every hour of every day, laid out edge to edge across the chart width. */
  protected hours = computed<PlottedHour[]>(() => {
    const flat = this.days().flatMap((d, dayIndex) => (d.hourly ?? []).map((h) => ({ ...h, dayIndex, x: 0 })));
    const last = Math.max(1, flat.length - 1);
    return flat.map((h, i) => ({ ...h, x: Math.round((i / last) * this.W * 10) / 10 }));
  });

  /** The icon strip is sampled every third hour — 72 icons would be unreadable. */
  protected stripHours = computed(() => this.hours().filter((_, i) => i % 3 === 0));

  protected dayBoundaries = computed(() => {
    const hs = this.hours();
    return hs.filter((h, i) => i > 0 && h.dayIndex !== hs[i - 1].dayIndex).map((h) => h.x);
  });

  protected tempPath = computed(() => this.path(this.hours().map((h) => h.temp), 198, 12));

  protected windPath = computed(() => this.path(this.hours().map((h) => h.wind), 104, 15));
  protected gustPath = computed(() => this.path(this.hours().map((h) => h.gusts), 104, 15));

  /**
   * The area between wind and gusts. Built by walking the gust line forwards and the wind
   * line backwards — a closed ring, so the fill never leaks across the chart.
   */
  protected gustBand = computed(() => {
    const scale = this.scaleY(
      [...this.hours().map((h) => h.wind), ...this.hours().map((h) => h.gusts)], 104, 15);
    const hs = this.hours();
    if (hs.length < 2) return '';
    const fwd = hs.map((h) => `${h.x},${scale(h.gusts)}`);
    const back = [...hs].reverse().map((h) => `${h.x},${scale(h.wind)}`);
    return `M${fwd.join(' L')} L${back.join(' L')} Z`;
  });

  protected precipBars = computed(() => {
    const values = this.hours().map((h) => h.precipitation);
    const max = Math.max(1, ...values);
    return this.hours()
      .map((h) => ({ x: h.x, h: Math.round((h.precipitation / max) * 90), y: 0 }))
      .filter((b) => b.h > 0)
      .map((b) => ({ ...b, y: 210 - b.h }));
  });

  protected sunBars = computed(() =>
    this.hours()
      .map((h) => ({ x: h.x, h: Math.round((Math.min(60, h.sunshineMinutes) / 60) * 80) }))
      .filter((b) => b.h > 0)
      .map((b) => ({ ...b, y: 90 - b.h })));

  protected hGrid(...ys: number[]): string {
    return ys.map((y) => `M0 ${y}h${this.W}`).join('');
  }

  /** Maps a series onto the chart, keeping the x positions of `hours()`. */
  private path(values: number[], height: number, top: number): string {
    if (values.length < 2) return '';
    const scale = this.scaleY(values, height, top);
    return 'M' + this.hours().map((h, i) => `${h.x},${scale(values[i])}`).join(' L');
  }

  /**
   * A shared vertical scale. Wind and gusts must use the SAME scale or the band between them
   * would be meaningless, which is why this is a function of the value set rather than baked
   * into each path.
   */
  private scaleY(values: number[], height: number, top: number): (v: number) => number {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    return (v: number) => span === 0
      ? Math.round((top + height / 2) * 10) / 10
      : Math.round((top + (1 - (v - min) / span) * height) * 10) / 10;
  }
}
