import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, signal, ViewEncapsulation } from '@angular/core';
import { IonButton, ModalController } from '@ionic/angular';
import type * as MapLibre from 'maplibre-gl';

import { dismissOverlay } from '@okr/shared-util-angular';
import { CLOSING_MS, FlyLeg, FlyStop, FlyTimeline, JournalI18n, JournalTileSource, OPENING_MS } from '@okr/travel-journal-util';

/**
 * The flyover (spec 1.113 phase 2, design 2026-10-24): a globe flight over the journal's route, opened as a
 * full-screen modal. It zooms in from space to the first footprint, moves a marker with the transport of each
 * stretch along the route and pops up a round thumbnail at every footprint; at the end it zooms out to the whole
 * route and closes. MapLibre is imported here, lazily, so no start bundle carries it; its worker and stylesheet
 * are app assets under `assets/maplibre/` (also offline on the iPad).
 */
const TRANSPORT_ICON: Record<string, string> = { plane: '✈️', ship: '🚢', bus: '🚌', train: '🚆', car: '🚗', bike: '🚲', foot: '🚶' };
const ASSET_BASE = 'assets/maplibre/';
let stylesheetAdded = false;

function addStylesheet(): void {
  if (stylesheetAdded || typeof document === 'undefined') return;
  stylesheetAdded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${ASSET_BASE}maplibre-gl.css`;
  document.head.appendChild(link);
}

/** Cumulative distances along a path (plain degrees — enough to move a marker evenly). */
function cumulative(path: [number, number][]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  return out;
}

function pointAt(path: [number, number][], dist: number[], f: number): [number, number] {
  const total = dist[dist.length - 1];
  if (total === 0) return path[path.length - 1];
  const target = f * total;
  let i = 1;
  while (i < dist.length - 1 && dist[i] < target) i++;
  const span = dist[i] - dist[i - 1] || 1;
  const t = (target - dist[i - 1]) / span;
  return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
}

/** A zoom that shows a leg whole: longer legs fly higher. */
function legZoom(path: [number, number][]): number {
  const lngs = path.map((p) => p[0]);
  const lats = path.map((p) => p[1]);
  const span = Math.max(Math.max(...lngs) - Math.min(...lngs), Math.max(...lats) - Math.min(...lats), 0.05);
  return Math.max(1.5, Math.min(9, Math.log2(360 / span) - 0.5));
}

@Component({
  selector: 'okr-journal-flyover',
  standalone: true,
  imports: [IonButton],
  encapsulation: ViewEncapsulation.None, // markers are created by MapLibre outside the component view
  styles: [`
    okr-journal-flyover { display: block; position: relative; width: 100%; height: 100%; background: #0b1d33; }
    okr-journal-flyover .okr-flyover-map { position: absolute; inset: 0; }
    okr-journal-flyover .okr-flyover-bar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: 8px;
      padding: 12px; padding-bottom: calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(transparent, rgba(0,0,0,.45)); }
    okr-journal-flyover .okr-flyover-title { position: absolute; top: calc(12px + env(safe-area-inset-top)); left: 16px; right: 16px;
      color: #fff; font-size: 1.1rem; text-shadow: 0 1px 4px rgba(0,0,0,.7); text-align: center; pointer-events: none; }
    .okr-flyover-marker { font-size: 28px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
    .okr-flyover-pin { width: 52px; height: 52px; border-radius: 50%; border: 3px solid #fff; overflow: hidden; background: #8aa;
      box-shadow: 0 2px 6px rgba(0,0,0,.5); transform: scale(0); transition: transform .35s cubic-bezier(.2,1.6,.4,1); }
    .okr-flyover-pin.shown { transform: scale(1); }
    .okr-flyover-pin img { width: 100%; height: 100%; object-fit: cover; display: block; }
  `],
  template: `
    <div class="okr-flyover-map"></div>
    <div class="okr-flyover-title">{{ caption() }}</div>
    <div class="okr-flyover-bar">
      <ion-button size="small" (click)="togglePause()">{{ paused() ? i18n().flyover_resume() : i18n().flyover_pause() }}</ion-button>
      <ion-button size="small" fill="outline" color="light" (click)="close()">{{ i18n().flyover_skip() }}</ion-button>
    </div>
  `,
})
export class JournalFlyover {
  private readonly modalController = inject(ModalController);
  private readonly el = inject(ElementRef<HTMLElement>);

  public readonly timeline = input.required<FlyTimeline>();
  /** Raster layers (Blue Marble online, or the journal's downloaded tiles); vector layers are ignored. */
  public readonly tiles = input<JournalTileSource[]>([]);
  public readonly i18n = input.required<JournalI18n>();

  protected readonly paused = signal(false);
  protected readonly caption = signal('');

  private map?: MapLibre.Map;
  private lib?: typeof MapLibre;
  private frame?: number;
  private destroyed = false;
  private pausedAt = 0;
  private pausedTotal = 0;

  public constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      this.map?.remove();
      this.map = undefined;
    });
  }

  protected togglePause(): void {
    if (this.paused()) {
      this.pausedTotal += performance.now() - this.pausedAt;
      this.paused.set(false);
    } else {
      this.pausedAt = performance.now();
      this.paused.set(true);
    }
  }

  protected async close(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'close');
  }

  private async start(): Promise<void> {
    addStylesheet();
    const lib = await import('maplibre-gl');
    if (this.destroyed) return;
    this.lib = lib;
    lib.setWorkerUrl(new URL(`${ASSET_BASE}maplibre-gl-worker.mjs`, document.baseURI).href);
    const container = (this.el.nativeElement as HTMLElement).querySelector('.okr-flyover-map') as HTMLElement;
    const timeline = this.timeline();
    const sources: Record<string, MapLibre.RasterSourceSpecification> = {};
    const layers: MapLibre.LayerSpecification[] = [{ id: 'bg', type: 'background', paint: { 'background-color': '#163a5f' } }];
    this.tiles().filter((t) => t.kind !== 'vector').forEach((t, i) => {
      sources[`t${i}`] = {
        type: 'raster', tiles: [t.urlTemplate], tileSize: 256, maxzoom: t.maxNativeZoom, minzoom: t.minNativeZoom ?? 0,
        attribution: t.attribution, ...(t.bounds ? { bounds: t.bounds } : {}),
      };
      layers.push({ id: `t${i}`, type: 'raster', source: `t${i}`, ...(t.minZoom !== undefined ? { minzoom: t.minZoom } : {}) });
    });
    const map = new lib.Map({
      container, attributionControl: { compact: true }, interactive: false,
      center: [timeline.start.lng, timeline.start.lat], zoom: 0.8,
      style: { version: 8, projection: { type: 'globe' }, sources, layers },
    });
    this.map = map;
    map.on('load', () => void this.fly(map, lib, timeline));
  }

  private async fly(map: MapLibre.Map, lib: typeof MapLibre, timeline: FlyTimeline): Promise<void> {
    map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } });
    map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#ff7a3d', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
    const marker = document.createElement('div');
    marker.className = 'okr-flyover-marker';
    marker.textContent = '📍';
    const markerRef = new lib.Marker({ element: marker }).setLngLat([timeline.start.lng, timeline.start.lat]).addTo(map);

    this.caption.set(timeline.start.title);
    this.pin(map, lib, timeline.start);
    map.flyTo({ center: [timeline.start.lng, timeline.start.lat], zoom: timeline.legs[0] ? legZoom(timeline.legs[0].path) : 6, duration: OPENING_MS, essential: true });
    await this.wait(OPENING_MS);

    const drawn: [number, number][] = [[timeline.start.lng, timeline.start.lat]];
    for (const leg of timeline.legs) {
      if (this.destroyed) return;
      marker.textContent = TRANSPORT_ICON[leg.transport ?? ''] ?? '📍';
      this.caption.set(leg.to.title);
      await this.runLeg(map, markerRef, leg, drawn);
      this.pin(map, lib, leg.to);
    }
    if (this.destroyed) return;
    const all = [timeline.start, ...timeline.legs.map((l) => l.to)];
    const bounds = new lib.LngLatBounds();
    for (const s of all) bounds.extend([s.lng, s.lat]);
    map.fitBounds(bounds, { padding: 60, duration: CLOSING_MS, maxZoom: 8 });
    await this.wait(CLOSING_MS + 1500);
    if (!this.destroyed) await this.close();
  }

  /** Moves the marker along one leg in its share of the time; the route line grows behind it. */
  private runLeg(map: MapLibre.Map, marker: MapLibre.Marker, leg: FlyLeg, drawn: [number, number][]): Promise<void> {
    const dist = cumulative(leg.path);
    const zoom = legZoom(leg.path);
    const startDrawn = drawn.length;
    return new Promise((resolve) => {
      const started = performance.now();
      const pausedBefore = this.pausedTotal;
      const tick = (now: number) => {
        if (this.destroyed) return resolve();
        if (this.paused()) {
          this.frame = requestAnimationFrame(tick);
          return;
        }
        const f = Math.min(1, (now - started - (this.pausedTotal - pausedBefore)) / leg.durationMs);
        const p = pointAt(leg.path, dist, f);
        marker.setLngLat(p);
        drawn.length = startDrawn;
        const reached = leg.path.filter((_, i) => dist[i] <= f * dist[dist.length - 1]);
        drawn.push(...reached, p);
        (map.getSource('route') as MapLibre.GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: drawn } });
        map.jumpTo({ center: p, zoom: map.getZoom() + (zoom - map.getZoom()) * 0.08 });
        if (f < 1) {
          this.frame = requestAnimationFrame(tick);
        } else {
          drawn.length = startDrawn;
          drawn.push(...leg.path);
          resolve();
        }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  /** The footprint's round thumbnail pops up and stays. */
  private pin(map: MapLibre.Map, lib: typeof MapLibre, stop: FlyStop): void {
    const el = document.createElement('div');
    el.className = 'okr-flyover-pin';
    if (stop.thumb) {
      const img = document.createElement('img');
      img.src = stop.thumb;
      img.alt = stop.title;
      el.appendChild(img);
    }
    new lib.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map);
    requestAnimationFrame(() => el.classList.add('shown'));
  }

  /** Waits `ms` of flyover time (pauses do not count). */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let left = ms;
      let last = performance.now();
      const tick = (now: number) => {
        if (this.destroyed) return resolve();
        if (!this.paused()) left -= now - last;
        last = now;
        if (left <= 0) resolve();
        else this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }
}
