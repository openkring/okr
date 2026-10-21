import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonLabel, IonSegment, IonSegmentButton } from '@ionic/angular';

import { WeatherHour, WeatherModel } from '@okr/shared-models';
import { AxisScale, hourStep, niceScale } from '@okr/weather-util';

import { WeatherIcon } from './weather-icon';

/** One hour plus its position on the time axis (`i` = index across all shown hours). */
interface PlottedHour extends WeatherHour { i: number; dayIndex: number; }

/** One icon-strip cell: the hour it shows and the pixel box it may use. */
interface StripCell { i: number; left: number; width: number; time: string; code: WeatherHour['code']; isDay: boolean; temp: number; prob: number; }

/** A bar covering `bin` hours, already in pixels. */
interface Bar { x: number; y: number; w: number; h: number; }

/** A labelled horizontal grid line. */
interface Tick { y: number; label: string; }

/** The viewer's last period choice. Per viewer and per browser — a convenience, not data. */
const RANGE_STORAGE_KEY = 'okr.weather.detail.range';

/** Left gutter (value labels), right gutter (precipitation labels), in px. */
const GL = 34;
const GR = 34;

/** Minimum width of one icon-strip cell (time, icon, temperature, probability). */
const MIN_CELL_PX = 46;
/** Minimum distance between hour labels on the time axis. */
const MIN_HOUR_LABEL_PX = 30;
/** Minimum pitch of one bar plus its gap — below that, neighbouring hours are merged. */
const MIN_BAR_PITCH_PX = 6;

/**
 * `forecast_detail` — the full local forecast: an hourly icon strip with temperature and
 * precipitation probability, a temperature curve with its uncertainty band and precipitation
 * bars, sunshine duration, and wind with gusts.
 *
 * All charts are plain SVG. They have no tooltips and no zoom, so a charting library would add
 * hundreds of kilobytes to the eager bundle for a handful of polylines and rectangles.
 *
 * The SVG coordinate system is the host's real pixel width (measured with a ResizeObserver),
 * not a fixed viewBox: a fixed 1160-unit viewBox shrank every label to ~3 px on a phone. Real
 * pixels also tell us how much fits, which is what drives the thinning: strip cells, hour
 * labels and bars all cover as many hours as needed to stay readable.
 *
 * The viewer picks how many days to see (1 / 2 / 3 / all configured days); fewer days means
 * more room per hour, so more cells, hour labels and individual bars appear.
 */
@Component({
  selector: 'okr-weather-forecast-detail',
  standalone: true,
  imports: [NgTemplateOutlet, WeatherIcon, IonSegment, IonSegmentButton, IonLabel],
  styles: [`
    :host { display: block; }
    ion-segment { max-width: 420px; margin: 0 auto 14px; }
    ion-segment-button { min-height: 32px; font-size: 13px; text-transform: none; }
    .tag {
      display: inline-block; font-size: 12px; font-weight: 600; border-radius: 5px; padding: 4px 9px;
      color: var(--ion-color-secondary, #014da2); background: var(--ion-color-step-100, #f2f4f8);
      margin-bottom: 6px;
    }
    .strip { position: relative; height: 92px; margin-bottom: 6px; }
    .strip .cell {
      position: absolute; top: 0; display: flex; flex-direction: column; align-items: center; gap: 1px;
      transform: translateX(-50%);
    }
    .strip .time { font-size: 10.5px; color: var(--ion-color-medium, #5f5f5f); font-variant-numeric: tabular-nums; }
    .strip .temp { font-size: 12.5px; font-weight: 600; color: var(--ion-color-danger, #c5000f); }
    .strip .prob { font-size: 10.5px; color: var(--ion-color-tertiary-shade, #0090e0); }
    .strip .divider { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--ion-color-step-200, #d5dae3); }
    .section-title { font-size: 16px; font-weight: 600; margin: 20px 0 6px; }
    .days { display: flex; margin-top: 2px; }
    .days > div {
      min-width: 0; text-align: center; font-size: 13px; font-weight: 600;
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    }
    svg { display: block; width: 100%; overflow: visible; }
    .grid { stroke: var(--ion-color-step-150, #e3e7ee); stroke-width: 1; }
    .divider { stroke: var(--ion-color-step-250, #c8ced8); stroke-width: 1; }
    .band { fill: var(--ion-color-danger, #c5000f); opacity: 0.14; }
    .temp { fill: none; stroke: var(--ion-color-danger, #c5000f); stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; }
    .bar { fill: var(--ion-color-tertiary, #00A2FF); }
    .sun { fill: var(--ion-color-warning, #ffc409); }
    .wind { fill: none; stroke: var(--ion-color-secondary, #014da2); stroke-width: 2.4; stroke-linejoin: round; }
    .gust { fill: none; stroke: var(--ion-color-tertiary, #00A2FF); stroke-width: 2; stroke-linejoin: round; }
    .gustband { fill: var(--ion-color-tertiary, #00A2FF); opacity: 0.16; }
    .axis { font-size: 11px; fill: var(--ion-color-medium, #5f5f5f); font-variant-numeric: tabular-nums; }
    .axis.rain { fill: var(--ion-color-tertiary-shade, #0090e0); }
    .axis.temp-unit { fill: var(--ion-color-danger, #c5000f); }
    .empty { padding: 20px 0; color: var(--ion-color-medium, #5f5f5f); font-size: 14px; }
  `],
  template: `
    @if (hours().length > 1) {
      @if (rangeOptions().length > 1) {
        <ion-segment [value]="range()" (ionChange)="pickRange($event.detail.value)"
                     [attr.aria-label]="rangeLabel()">
          @for (o of rangeOptions(); track o.days) {
            <ion-segment-button [value]="o.days"><ion-label>{{ o.label }}</ion-label></ion-segment-button>
          }
        </ion-segment>
      }

      <div class="tag">{{ probabilityLabel() }}</div>
      <div class="strip">
        @for (x of dayEdges(); track x) { <div class="divider" [style.left.px]="x"></div> }
        @for (c of stripCells(); track c.i) {
          <div class="cell" [style.left.px]="c.left" [style.width.px]="c.width">
            <div class="time">{{ c.time }}</div>
            <okr-weather-icon [code]="c.code" [isDay]="c.isDay" [size]="iconSize()" />
            <div class="temp">{{ c.temp }}°</div>
            <div class="prob">{{ c.prob }}%</div>
          </div>
        }
      </div>

      <!-- temperature + precipitation -->
      <svg [attr.viewBox]="'0 0 ' + W() + ' ' + TH" [attr.height]="TH">
        @for (t of tempTicks(); track t.y) {
          <path class="grid" [attr.d]="hLine(t.y)" />
          <text class="axis" [attr.x]="GL - 6" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
        }
        @for (t of rainTicks(); track t.y) {
          <text class="axis rain" [attr.x]="W() - GR + 6" [attr.y]="t.y + 4">{{ t.label }}</text>
        }
        <text class="axis temp-unit" x="0" y="11">°C</text>
        <text class="axis rain" [attr.x]="W()" y="11" text-anchor="end">mm/h</text>
        @for (x of dayEdges(); track x) { <path class="divider" [attr.d]="vLine(x, TOP, T_BOTTOM)" /> }
        @for (b of rainBars(); track b.x) {
          <rect class="bar" [attr.x]="b.x - b.w / 2" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="1" />
        }
        <path class="band" [attr.d]="tempBand()" />
        <path class="temp" [attr.d]="tempPath()" />
        @for (l of hourLabels(); track l.x) {
          <text class="axis" [attr.x]="l.x" [attr.y]="TH - 4" text-anchor="middle">{{ l.label }}</text>
        }
      </svg>
      <ng-container [ngTemplateOutlet]="dayRow" />

      <!-- sunshine -->
      <div class="section-title">{{ sunshineLabel() }}</div>
      <svg [attr.viewBox]="'0 0 ' + W() + ' ' + SH" [attr.height]="SH">
        @for (t of sunTicks; track t.v) {
          <path class="grid" [attr.d]="hLine(sunY(t.v))" />
          <text class="axis" [attr.x]="GL - 6" [attr.y]="sunY(t.v) + 4" text-anchor="end">{{ t.v }}</text>
        }
        <text class="axis" x="0" y="11">min/h</text>
        @for (x of dayEdges(); track x) { <path class="divider" [attr.d]="vLine(x, TOP, S_BOTTOM)" /> }
        @for (b of sunBars(); track b.x) {
          <rect class="sun" [attr.x]="b.x - b.w / 2" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="1" />
        }
      </svg>
      <ng-container [ngTemplateOutlet]="dayRow" />

      <!-- wind -->
      <div class="section-title">{{ windLabel() }}</div>
      <svg [attr.viewBox]="'0 0 ' + W() + ' ' + WH" [attr.height]="WH">
        @for (t of windTicks(); track t.y) {
          <path class="grid" [attr.d]="hLine(t.y)" />
          <text class="axis" [attr.x]="GL - 6" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
        }
        <text class="axis" x="0" y="11">km/h</text>
        @for (x of dayEdges(); track x) { <path class="divider" [attr.d]="vLine(x, TOP, W_BOTTOM)" /> }
        <path class="gustband" [attr.d]="gustBand()" />
        <path class="gust" [attr.d]="gustPath()" />
        <path class="wind" [attr.d]="windPath()" />
      </svg>
      <ng-container [ngTemplateOutlet]="dayRow" />

      <ng-template #dayRow>
        <div class="days" [style.padding-left.px]="GL" [style.padding-right.px]="GR">
          @for (d of dayCells(); track d.key) { <div [style.flex]="d.hours">{{ d.label }}</div> }
        </div>
      </ng-template>
    } @else {
      <div class="empty">{{ emptyLabel() }}</div>
    }
  `
})
export class WeatherForecastDetail {
  public days = input.required<WeatherModel[]>();
  /** Already-formatted weekday + date per day, in the same order as `days` (e.g. "Mi 21.10."). */
  public dayLabels = input<string[]>([]);
  public probabilityLabel = input('');
  public sunshineLabel = input('');
  public windLabel = input('');
  public emptyLabel = input('');
  public rangeLabel = input('');
  public rangeOneLabel = input('1');
  /** Contains `{n}`, e.g. "{n} Tage". */
  public rangeManyLabel = input('{n}');

  protected readonly GL = GL;
  protected readonly GR = GR;
  /** Chart heights and the shared top of every plot area (room for the unit label above). */
  protected readonly TOP = 20;
  protected readonly TH = 214;
  protected readonly T_BOTTOM = 194;
  protected readonly SH = 98;
  protected readonly S_BOTTOM = 92;
  protected readonly WH = 130;
  protected readonly W_BOTTOM = 124;

  // ---- width ----------------------------------------------------------------------------
  private readonly measured = signal(0);
  /** Chart width in px. Until the first measurement a desktop-ish guess keeps SSR sane. */
  protected W = computed(() => Math.max(280, Math.round(this.measured() || 720)));
  private plotW = computed(() => this.W() - GL - GR);

  // ---- period ---------------------------------------------------------------------------
  private readonly picked = signal<number | undefined>(readStoredRange());

  protected rangeOptions = computed(() => {
    const max = this.days().length;
    const values = [...new Set([1, 2, 3, max])].filter((n) => n >= 1 && n <= max).sort((a, b) => a - b);
    return values.map((days) => ({
      days, label: days === 1 ? this.rangeOneLabel() : this.rangeManyLabel().replace('{n}', String(days))
    }));
  });

  /** Days shown. Defaults to three: enough for the weekend, still readable on a phone. */
  protected range = computed(() => {
    const max = Math.max(1, this.days().length);
    return Math.min(max, Math.max(1, this.picked() ?? 3));
  });

  private shownDays = computed(() => this.days().slice(0, this.range()));

  // ---- time axis ------------------------------------------------------------------------
  /** Every hour of every shown day, each in its own slot of equal width. */
  protected hours = computed<PlottedHour[]>(() =>
    this.shownDays()
      .flatMap((d, dayIndex) => (d.hourly ?? []).map((h) => ({ ...h, dayIndex })))
      .map((h, i) => ({ ...h, i })));

  private slot = computed(() => this.plotW() / Math.max(1, this.hours().length));

  /** Centre of hour `i`. Slots, not `i / (n-1)`: a day then spans exactly its own 24 slots. */
  private xAt(i: number): number {
    return round1(GL + (i + 0.5) * this.slot());
  }

  protected dayEdges = computed(() => {
    const hs = this.hours();
    return hs.filter((h, i) => i > 0 && h.dayIndex !== hs[i - 1].dayIndex)
      .map((h) => round1(GL + h.i * this.slot()));
  });

  protected dayCells = computed(() => {
    const labels = this.dayLabels();
    const perDay = this.shownDays().map((d) => Math.max(1, d.hourly?.length ?? 0));
    const total = perDay.reduce((a, b) => a + b, 0);
    return this.shownDays().map((d, i) => {
      const label = labels[i] ?? '';
      const px = (perDay[i] / total) * this.plotW();
      // a narrow day keeps only its weekday ("Mi" rather than "Mi 21.10.")
      return { key: d.date, hours: perDay[i], label: px < 72 ? label.split(' ')[0] : label };
    });
  });

  /** Hour labels under the temperature chart; only where they fit, never at midnight (the divider). */
  protected hourLabels = computed(() => {
    const hs = this.hours();
    const step = hourStep(hs.length, this.plotW(), MIN_HOUR_LABEL_PX);
    if (step >= 24) return [];
    return hs.filter((h) => h.i % step === 0 && !this.dayEdges().includes(round1(GL + h.i * this.slot())) && h.i > 0)
      .map((h) => ({ x: round1(GL + h.i * this.slot()), label: h.time.slice(0, 2) }));
  });

  // ---- icon strip -----------------------------------------------------------------------
  private stripStep = computed(() => hourStep(this.hours().length, this.plotW(), MIN_CELL_PX));

  protected stripCells = computed<StripCell[]>(() => {
    const step = this.stripStep();
    const width = step * this.slot();
    return this.hours().filter((h) => h.i % step === 0).map((h) => ({
      i: h.i, left: this.xAt(h.i), width, time: h.time, code: h.code, isDay: h.isDay,
      temp: Math.round(h.temp), prob: Math.round(h.precipitationProbability ?? 0),
    }));
  });

  protected iconSize = computed(() => (this.stripStep() * this.slot() >= 60 ? 34 : 28));

  // ---- temperature + precipitation ------------------------------------------------------
  private tempScale = computed(() => {
    const hs = this.hours();
    const lows = hs.map((h) => Math.min(h.temp, num(h.tempMin, h.temp)));
    const highs = hs.map((h) => Math.max(h.temp, num(h.tempMax, h.temp)));
    return niceScale(Math.min(...lows), Math.max(...highs), 5, 4);
  });

  private tempY = (v: number) => scaleTo(v, this.tempScale(), this.TOP, this.T_BOTTOM);

  protected tempTicks = computed<Tick[]>(() =>
    this.tempScale().ticks.map((t) => ({ y: this.tempY(t), label: `${t}°` })));

  protected tempPath = computed(() => this.line(this.hours().map((h) => h.temp), this.tempY));

  /** Ensemble spread: tempMax forwards, tempMin backwards — a closed ring. */
  protected tempBand = computed(() => this.ring(
    this.hours().map((h) => num(h.tempMax, h.temp)), this.hours().map((h) => num(h.tempMin, h.temp)), this.tempY));

  /** Precipitation uses the lower 45 % of the chart and its own scale, labelled on the right. */
  private rainScale = computed(() =>
    niceScale(0, Math.max(0, ...this.hours().map((h) => h.precipitation ?? 0)), 3, 1));

  private rainY = (v: number) => {
    const top = this.T_BOTTOM - (this.T_BOTTOM - this.TOP) * 0.45;
    return scaleTo(v, this.rainScale(), top, this.T_BOTTOM);
  };

  protected rainTicks = computed<Tick[]>(() =>
    this.rainScale().ticks.filter((t) => t > 0).map((t) => ({ y: this.rainY(t), label: String(t) })));

  /** Per bin the peak hour: averaging would flatten a short downpour into drizzle. */
  protected rainBars = computed(() => this.bars(
    (bin) => Math.max(...bin.map((h) => h.precipitation ?? 0)), this.rainY, this.T_BOTTOM));

  // ---- sunshine -------------------------------------------------------------------------
  protected readonly sunTicks = [{ v: 0 }, { v: 30 }, { v: 60 }];
  private readonly sunScale: AxisScale = { min: 0, max: 60, ticks: [0, 30, 60] };
  protected sunY = (v: number) => scaleTo(v, this.sunScale, this.TOP, this.S_BOTTOM);

  /** Per bin the average minutes of sunshine per hour, so the axis stays "min/h". */
  protected sunBars = computed(() => this.bars(
    (bin) => bin.reduce((sum, h) => sum + Math.min(60, h.sunshineMinutes ?? 0), 0) / bin.length,
    this.sunY, this.S_BOTTOM));

  // ---- wind -----------------------------------------------------------------------------
  /** Wind and gusts share ONE scale, otherwise the band between them would be meaningless. */
  private windScale = computed(() =>
    niceScale(0, Math.max(0, ...this.hours().flatMap((h) => [h.wind ?? 0, h.gusts ?? 0])), 4, 10));

  private windY = (v: number) => scaleTo(v, this.windScale(), this.TOP, this.W_BOTTOM);

  protected windTicks = computed<Tick[]>(() =>
    this.windScale().ticks.map((t) => ({ y: this.windY(t), label: String(t) })));

  protected windPath = computed(() => this.line(this.hours().map((h) => h.wind ?? 0), this.windY));
  protected gustPath = computed(() => this.line(this.hours().map((h) => h.gusts ?? 0), this.windY));
  protected gustBand = computed(() => this.ring(
    this.hours().map((h) => h.gusts ?? 0), this.hours().map((h) => h.wind ?? 0), this.windY));

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.measured.set(host.clientWidth);
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 0;
        // sub-pixel jitter would rebuild every chart for nothing
        if (Math.abs(width - this.measured()) >= 1) this.measured.set(width);
      });
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected pickRange(value: unknown): void {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return;
    this.picked.set(n);
    try { localStorage.setItem(RANGE_STORAGE_KEY, String(n)); } catch { /* private mode: keep it for this view only */ }
  }

  protected hLine(y: number): string {
    return `M${GL} ${y}H${this.W() - GR}`;
  }

  protected vLine(x: number, top: number, bottom: number): string {
    return `M${x} ${top}V${bottom}`;
  }

  private line(values: number[], y: (v: number) => number): string {
    if (values.length < 2) return '';
    return 'M' + values.map((v, i) => `${this.xAt(i)},${y(v)}`).join(' L');
  }

  /** Area between an upper and a lower series: upper forwards, lower backwards, closed. */
  private ring(upper: number[], lower: number[], y: (v: number) => number): string {
    if (upper.length < 2) return '';
    const fwd = upper.map((v, i) => `${this.xAt(i)},${y(v)}`);
    const back = lower.map((v, i) => `${this.xAt(i)},${y(v)}`).reverse();
    return `M${fwd.join(' L')} L${back.join(' L')} Z`;
  }

  /**
   * Bars, merged into bins of 1, 2, 3, … hours until each bar plus its gap is at least
   * `MIN_BAR_PITCH_PX` wide. Bars take 60 % of their bin, so there is always visible air
   * between two sunny hours — without it a sunny day reads as one solid block.
   */
  private bars(value: (bin: PlottedHour[]) => number, y: (v: number) => number, bottom: number): Bar[] {
    const hs = this.hours();
    const bin = hourStep(hs.length, this.plotW(), MIN_BAR_PITCH_PX);
    const w = round1(Math.min(16, Math.max(1, bin * this.slot() * 0.6)));
    const out: Bar[] = [];
    for (let start = 0; start < hs.length; start += bin) {
      const group = hs.slice(start, start + bin);
      const v = value(group);
      if (!(v > 0)) continue;
      const top = y(v);
      const h = round1(bottom - top);
      if (h < 0.5) continue;
      out.push({ x: round1(GL + (start + group.length / 2) * this.slot()), y: top, w, h });
    }
    return out;
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Firestore reads skip model defaults: fields added later are undefined on older documents. */
function num(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function scaleTo(v: number, scale: AxisScale, top: number, bottom: number): number {
  const span = scale.max - scale.min || 1;
  const clamped = Math.min(scale.max, Math.max(scale.min, v));
  return round1(bottom - ((clamped - scale.min) / span) * (bottom - top));
}

function readStoredRange(): number | undefined {
  try {
    const n = Number(localStorage.getItem(RANGE_STORAGE_KEY));
    return Number.isFinite(n) && n >= 1 ? n : undefined;
  } catch {
    return undefined;
  }
}
