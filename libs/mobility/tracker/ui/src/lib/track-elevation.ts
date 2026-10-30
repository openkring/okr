import { Component, computed, input, output, signal } from '@angular/core';
import { IonNote } from '@ionic/angular';
import { formatKm, thinProfile, type ElevationPoint, type ElevationProfile, type TrackerI18n } from '@okr/mobility-tracker-util';

/** viewBox of the chart; the SVG is stretched to the box (preserveAspectRatio none), the labels are HTML on top. */
const W = 1000;
const H = 200;
/** More points than pixels buy nothing: the line is thinned to this many. */
const MAX_CHART_POINTS = 400;

/**
 * The height-over-distance profile of a Strecke (spec 1.128 §4): an area chart without a chart library, climb and
 * descent above it. Moving the pointer or a finger across it emits the point underneath (`pointed`), which the page
 * marks on the map; lifting a mouse off the chart clears it, a finger leaves the mark where it was.
 * `note` (e.g. which terrain model the heights come from) shows under the chart.
 */
@Component({
  selector: 'okr-track-elevation',
  imports: [IonNote],
  styles: [`
    :host { display: block; padding: 0 16px 8px; }
    .figures { display: flex; gap: 16px; font-size: 0.9rem; margin-bottom: 6px; }
    .chart { position: relative; height: 140px; touch-action: pan-y; user-select: none; cursor: crosshair; }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .area { fill: var(--ion-color-primary); fill-opacity: 0.18; }
    .line { fill: none; stroke: var(--ion-color-primary); stroke-width: 2; }
    .cursor { stroke: var(--ion-color-medium); stroke-width: 1; }
    .label { position: absolute; font-size: 0.7rem; color: var(--ion-color-medium); pointer-events: none; }
    .max { top: 0; left: 0; }
    .min { bottom: 0; left: 0; }
    .end { bottom: -16px; right: 0; }
    .start { bottom: -16px; left: 0; }
    .tip { top: -4px; transform: translateX(-50%); background: var(--ion-background-color, #fff); padding: 0 4px;
      border-radius: 4px; color: var(--ion-text-color); white-space: nowrap; }
    ion-note { display: block; margin-top: 20px; font-size: 0.75rem; }
  `],
  template: `
    <div class="figures">
      <span>↑ {{ profile().gainM }} m {{ i18n().elevation_gain() }}</span>
      <span>↓ {{ profile().lossM }} m {{ i18n().elevation_loss() }}</span>
    </div>
    <div class="chart" role="img" [attr.aria-label]="ariaLabel()"
      (pointerdown)="onPointer($event)" (pointermove)="onPointer($event)" (pointerleave)="onLeave($event)">
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" preserveAspectRatio="none" aria-hidden="true">
        <path class="area" [attr.d]="paths().area" />
        <path class="line" [attr.d]="paths().line" vector-effect="non-scaling-stroke" />
        @if (cursor(); as c) {
          <line class="cursor" [attr.x1]="c.x" [attr.x2]="c.x" y1="0" [attr.y2]="height" vector-effect="non-scaling-stroke" />
        }
      </svg>
      <span class="label max">{{ profile().maxM }} m</span>
      <span class="label min">{{ profile().minM }} m</span>
      <span class="label start">0 km</span>
      <span class="label end">{{ km(profile().totalM) }}</span>
      @if (cursor(); as c) {
        <span class="label tip" [style.left.%]="c.x / width * 100">{{ c.point.altM }} m · {{ km(c.point.distM) }}</span>
      }
    </div>
    @if (note()) {
      <ion-note>{{ note() }}</ion-note>
    }
  `,
})
export class TrackElevation {
  public readonly profile = input.required<ElevationProfile>();
  public readonly i18n = input.required<TrackerI18n>();
  /** a line under the chart, e.g. the terrain model's attribution; '' = none */
  public readonly note = input('');

  /** the profile point under the pointer; undefined when the mouse left the chart */
  public readonly pointed = output<ElevationPoint | undefined>();

  protected readonly width = W;
  protected readonly height = H;
  private readonly active = signal<ElevationPoint | undefined>(undefined);

  private readonly points = computed(() => thinProfile(this.profile().points, MAX_CHART_POINTS));
  /** heights are drawn from a little below the lowest point, so a flat stretch is not glued to the bottom */
  private readonly scale = computed(() => {
    const p = this.profile();
    const pad = Math.max(5, (p.maxM - p.minM) * 0.1);
    const lo = p.minM - pad;
    const hi = p.maxM + pad;
    const total = Math.max(1, p.totalM);
    return { x: (d: number) => (d / total) * W, y: (a: number) => H - ((a - lo) / (hi - lo)) * H };
  });
  protected readonly paths = computed(() => {
    const { x, y } = this.scale();
    const pts = this.points();
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.distM).toFixed(1)},${y(p.altM).toFixed(1)}`).join(' ');
    const first = pts[0];
    const last = pts[pts.length - 1];
    const area = first && last ? `${line} L${x(last.distM).toFixed(1)},${H} L${x(first.distM).toFixed(1)},${H} Z` : '';
    return { line, area };
  });
  protected readonly cursor = computed(() => {
    const point = this.active();
    return point ? { point, x: this.scale().x(point.distM) } : undefined;
  });
  protected readonly ariaLabel = computed(() => {
    const p = this.profile();
    return `${this.i18n().elevation_title()}: ${p.minM}–${p.maxM} m, ↑ ${p.gainM} m, ↓ ${p.lossM} m`;
  });

  protected km(m: number): string {
    return formatKm(m);
  }

  protected onPointer(event: PointerEvent): void {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (box.width <= 0) return;
    const dist = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * this.profile().totalM;
    const point = nearest(this.profile().points, dist);
    if (point === this.active()) return;
    this.active.set(point);
    this.pointed.emit(point);
  }

  protected onLeave(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return; // a finger leaves the mark where it was lifted
    this.active.set(undefined);
    this.pointed.emit(undefined);
  }
}

/** The profile point closest to `distM` (points ascending by distance). */
function nearest(points: ElevationPoint[], distM: number): ElevationPoint | undefined {
  if (points.length === 0) return undefined;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distM < distM) lo = mid + 1;
    else hi = mid;
  }
  const before = points[Math.max(0, lo - 1)];
  return Math.abs(before.distM - distM) < Math.abs(points[lo].distM - distM) ? before : points[lo];
}
