import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, ViewEncapsulation } from '@angular/core';
import type * as L from 'leaflet';
import type { TransportMode } from '@okr/shared-models';
import { TRACK_MODE_COLOR, type TrackPoint } from '@okr/mobility-tracker-util';

export interface TrackMapSection { mode: TransportMode; points: TrackPoint[] }

const TILE_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
const FIT_PADDING: L.PointExpression = [32, 32];
const SINGLE_POINT_ZOOM = 15;
const MAX_FIT_ZOOM = 17;
const DEFAULT_VIEW: L.LatLngExpression = [46.8, 8.2]; // Switzerland, until the first point arrives

/**
 * The recorded track on a swisstopo map: one polyline per section in the colour of its transport mode
 * (plane dashed), a start and an end dot. Fits to the data on first data and whenever the number of
 * sections changes; with `live` the map follows the last point without touching the zoom.
 * Leaflet is loaded lazily on first render (its stylesheet is global in the apps).
 * Height: CSS variable `--okr-track-map-height` (default max(280px, 50vh)).
 */
@Component({
  selector: 'okr-track-map',
  encapsulation: ViewEncapsulation.None, // the dots are created by Leaflet outside the component view
  styles: [`
    okr-track-map { display: block; position: relative; overflow: hidden; width: 100%;
      height: var(--okr-track-map-height, max(280px, 50vh)); background: var(--ion-color-light, #dfe9ef); }
    okr-track-map .okr-track-map-canvas { position: absolute; inset: 0; }
    .okr-track-dot-icon { background: transparent; border: none; }
    .okr-track-dot { width: 14px; height: 14px; border-radius: 50%; border: 3px solid #fff; box-sizing: border-box;
      box-shadow: 0 0 3px rgba(0,0,0,.6); }
    .okr-track-dot.start { background: #2e7d32; }
    .okr-track-dot.end { background: #c62828; }
  `],
  template: `<div class="okr-track-map-canvas"></div>`,
})
export class TrackMap {
  public readonly sections = input<TrackMapSection[]>([]);
  public readonly live = input(false);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private leaflet?: typeof L;
  private map?: L.Map;
  private overlay?: L.LayerGroup;
  private resizeObserver?: ResizeObserver;
  private destroyed = false;
  private fitted = false;
  private lastSectionCount = -1;

  public constructor() {
    afterNextRender(() => void this.init());
    effect(() => {
      const sections = this.sections();
      const live = this.live();
      if (this.map) this.render(sections, live);
    });
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  private async init(): Promise<void> {
    if (!this.leaflet) {
      // leaflet is CJS: the production chunk exposes it only as `default`, dev serve as named exports
      const mod = await import('leaflet');
      this.leaflet = (mod as { default?: typeof L }).default ?? mod;
    }
    const container = this.el.nativeElement.querySelector('.okr-track-map-canvas') as HTMLElement | null;
    // the host may be gone (conditional block toggled) while Leaflet was loading
    if (this.destroyed || !container || !container.isConnected || this.map) return;
    this.map = this.leaflet.map(container, { zoomControl: true, attributionControl: true });
    this.leaflet.tileLayer(TILE_URL, { maxZoom: 19, attribution: '© swisstopo' }).addTo(this.map);
    this.overlay = this.leaflet.layerGroup().addTo(this.map);
    this.map.setView(DEFAULT_VIEW, 8);
    this.render(this.sections(), this.live());
    this.resizeObserver = new ResizeObserver(() => {
      if (this.destroyed || !this.map) return;
      this.map.invalidateSize();
    });
    this.resizeObserver.observe(this.el.nativeElement);
  }

  private render(sections: TrackMapSection[], live: boolean): void {
    const Lf = this.leaflet;
    const map = this.map;
    if (!Lf || !map || !this.overlay || this.destroyed) return;
    this.overlay.clearLayers();

    const all: L.LatLngTuple[] = [];
    for (const section of sections) {
      const latlngs = section.points.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      all.push(...latlngs);
      if (latlngs.length > 1) {
        Lf.polyline(latlngs, {
          color: TRACK_MODE_COLOR[section.mode], weight: 5, opacity: 0.9,
          ...(section.mode === 'plane' ? { dashArray: '8 8' } : {}),
        }).addTo(this.overlay);
      }
    }
    if (all.length > 0) {
      this.addDot(Lf, all[0], 'start');
      this.addDot(Lf, all[all.length - 1], 'end');
    }

    const countChanged = sections.length !== this.lastSectionCount;
    this.lastSectionCount = sections.length;
    if (all.length > 0 && (!this.fitted || countChanged)) {
      this.fitted = true;
      if (all.length > 1) map.fitBounds(Lf.latLngBounds(all), { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM });
      else map.setView(all[0], SINGLE_POINT_ZOOM);
    } else if (live && all.length > 0) {
      map.panTo(all[all.length - 1], { animate: true }); // pan only: the zoom stays
    }
  }

  private addDot(Lf: typeof L, at: L.LatLngTuple, kind: 'start' | 'end'): void {
    if (!this.overlay) return;
    const icon = Lf.divIcon({ className: 'okr-track-dot-icon', html: `<div class="okr-track-dot ${kind}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
    Lf.marker(at, { icon, interactive: false, keyboard: false }).addTo(this.overlay);
  }

  private teardown(): void {
    this.destroyed = true; // an init still waiting for Leaflet must not create a map afterwards
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.map?.remove();
    this.map = undefined;
    this.overlay = undefined;
  }
}
