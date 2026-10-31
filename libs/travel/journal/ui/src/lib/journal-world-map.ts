import { Component, computed, input } from '@angular/core';

import { Bbox, MapPlace } from '@okr/travel-journal-util';

import { WORLD_OUTLINE_PATH } from './world-outline';

/** One map area on the world map; `filled` = at least one of its layers is usable on this iPad. */
export interface WorldMapArea { id: string; bbox: Bbox; filled: boolean }

const WORLD = { x: 0, y: 0, w: 360, h: 180 };
const ASPECT = 2; // width : height of the drawn view (the world's own ratio)
const PADDING = 0.15; // of the areas' extent, on every side
const MIN_HEIGHT = 12; // degrees: a single small area is not blown up to a blur

/**
 * The schematic world map of «Offline-Karten verwalten» (spec 1.126 phase 4 §7.3): an inline SVG of the Natural Earth
 * land outline in an equirectangular projection (x = lng + 180, y = 90 − lat), zoomed to the areas' extent. Each area is
 * an outline box, filled when downloaded here; the landing sites are dots. It draws no tiles, so it works offline.
 */
@Component({
  selector: 'okr-journal-world-map',
  styles: [`
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; border-radius: 8px; background: var(--ion-color-light, #f4f5f8); }
    .land { fill: var(--ion-color-medium-tint, #a2a4ab); fill-opacity: 0.45; stroke: none; }
    .area { fill: var(--ion-color-primary, #3880ff); fill-opacity: 0; stroke: var(--ion-color-primary, #3880ff); stroke-width: 1.5; }
    .area.filled { fill-opacity: 0.35; }
    .place { fill: var(--ion-color-danger, #eb445a); }
  `],
  template: `
    <svg [attr.viewBox]="viewBox()" preserveAspectRatio="xMidYMid meet" role="img" [attr.aria-label]="label()">
      <path class="land" [attr.d]="outline" />
      @for (area of boxes(); track area.id) {
        <rect class="area" [class.filled]="area.filled" vector-effect="non-scaling-stroke"
          [attr.x]="area.x" [attr.y]="area.y" [attr.width]="area.w" [attr.height]="area.h" />
      }
      @for (place of dots(); track $index) {
        <circle class="place" [attr.cx]="place.x" [attr.cy]="place.y" [attr.r]="dotRadius()" />
      }
    </svg>
  `,
})
export class JournalWorldMap {
  public readonly areas = input<WorldMapArea[]>([]);
  public readonly places = input<MapPlace[]>([]);
  /** Accessible name of the map. */
  public readonly label = input('');

  protected readonly outline = WORLD_OUTLINE_PATH;

  protected readonly boxes = computed(() => this.areas().map((a) => {
    const [w, s, e, n] = a.bbox;
    return { id: a.id, filled: a.filled, x: w + 180, y: 90 - n, w: Math.max(0, e - w), h: Math.max(0, n - s) };
  }));

  protected readonly dots = computed(() => this.places().map((p) => ({ x: p.lng + 180, y: 90 - p.lat })));

  /** The areas' extent plus padding, widened to the world's 2:1 ratio and kept inside the world; the whole world without areas. */
  private readonly view = computed(() => {
    const boxes = this.boxes();
    if (boxes.length === 0) return WORLD;
    let x0 = Math.min(...boxes.map((b) => b.x));
    let x1 = Math.max(...boxes.map((b) => b.x + b.w));
    let y0 = Math.min(...boxes.map((b) => b.y));
    let y1 = Math.max(...boxes.map((b) => b.y + b.h));
    const pad = PADDING * Math.max(x1 - x0, (y1 - y0) * ASPECT);
    x0 -= pad; x1 += pad; y0 -= pad / ASPECT; y1 += pad / ASPECT;
    let h = Math.max(y1 - y0, (x1 - x0) / ASPECT, MIN_HEIGHT);
    h = Math.min(h, WORLD.h);
    const w = h * ASPECT;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const x = Math.min(Math.max(cx - w / 2, WORLD.x), WORLD.w - w);
    const y = Math.min(Math.max(cy - h / 2, WORLD.y), WORLD.h - h);
    return { x, y, w, h };
  });

  protected readonly viewBox = computed(() => {
    const v = this.view();
    return [v.x, v.y, v.w, v.h].map((n) => Math.round(n * 100) / 100).join(' ');
  });

  /** About 4 px on a typical modal width, whatever the zoom. */
  protected readonly dotRadius = computed(() => Math.max(0.05, this.view().w / 120));
}
