import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, untracked, ViewEncapsulation } from '@angular/core';
import type * as L from 'leaflet';
import type { TransportMode } from '@okr/shared-models';
import { TRACK_MODE_COLOR, type TrackPoint } from '@okr/mobility-tracker-util';

export interface TrackMapSection { mode: TransportMode; points: TrackPoint[] }
/** A photo pin: `src` is a displayable URL (local file or data URL); without one a small camera dot is drawn. */
export interface TrackMapPhoto { lat: number; lng: number; src?: string; hidden: boolean }

const TILE_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
const FIT_PADDING: L.PointExpression = [32, 32];
const SINGLE_POINT_ZOOM = 15;
const MAX_FIT_ZOOM = 17;
const DEFAULT_VIEW: L.LatLngExpression = [46.8, 8.2]; // Switzerland, until the first point arrives
const PHOTO_PIN_PX = 32;
const PHOTO_DOT_PX = 16;
const PHOTO_PIN_SELECTED_PX = 46;
const PHOTO_DOT_SELECTED_PX = 22;
const SELECTED_MIN_ZOOM = 16;

/**
 * The recorded track on a swisstopo map: one polyline per section in the colour of its transport mode
 * (plane dashed), a start and an end dot, and a round thumbnail pin per visible photo (hidden photos are not drawn;
 * photos live in their own layer, so a new thumbnail never redraws or refits the track). Fits to the data on first data and whenever the number of
 * sections changes; with `live` the map follows the last point without touching the zoom.
 * Leaflet is loaded lazily on first render (its stylesheet is global in the apps).
 * `selectedPhoto` (index into `photos`) pans the map to that pin (zoom at least 16) and draws it enlarged; undefined
 * clears the highlight without moving the map.
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
    .okr-track-photo-pin { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #fff; box-sizing: border-box;
      box-shadow: 0 0 3px rgba(0,0,0,.6); object-fit: cover; display: block; background: #fff; }
    .okr-track-photo-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #fff; box-sizing: border-box;
      box-shadow: 0 0 3px rgba(0,0,0,.6); background: #455a64; position: relative; }
    .okr-track-photo-pin.selected { width: 46px; height: 46px; border: 3px solid #ffd34d; box-shadow: 0 1px 6px rgba(0,0,0,.6); }
    .okr-track-photo-dot.selected { width: 22px; height: 22px; border: 3px solid #ffd34d; }
    .okr-track-photo-dot::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: #fff; transform: scale(.55); }
  `],
  template: `<div class="okr-track-map-canvas"></div>`,
})
export class TrackMap {
  public readonly sections = input<TrackMapSection[]>([]);
  public readonly live = input(false);
  public readonly photos = input<TrackMapPhoto[]>([]);
  /** index into `photos` of the highlighted pin; undefined = none */
  public readonly selectedPhoto = input<number | undefined>(undefined);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private leaflet?: typeof L;
  private map?: L.Map;
  private overlay?: L.LayerGroup;
  private photoLayer?: L.LayerGroup;
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
    effect(() => {
      const photos = this.photos();
      const selected = this.selectedPhoto();
      if (this.map) this.renderPhotos(photos, selected);
    });
    // pan only when the selection changes, not when a thumbnail arrives
    effect(() => {
      const selected = this.selectedPhoto();
      if (this.map) untracked(() => this.panToPhoto(selected));
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
    this.photoLayer = this.leaflet.layerGroup().addTo(this.map); // above the track
    this.map.setView(DEFAULT_VIEW, 8);
    this.render(this.sections(), this.live());
    this.renderPhotos(this.photos(), this.selectedPhoto());
    this.panToPhoto(this.selectedPhoto());
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

  private panToPhoto(selected: number | undefined): void {
    const photo = selected === undefined ? undefined : this.photos()[selected];
    if (!this.map || this.destroyed || !photo || photo.hidden) return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.map.setView([photo.lat, photo.lng], Math.max(this.map.getZoom(), SELECTED_MIN_ZOOM), { animate: !reduced });
  }

  private renderPhotos(photos: TrackMapPhoto[], selected: number | undefined): void {
    const Lf = this.leaflet;
    const layer = this.photoLayer;
    if (!Lf || !this.map || !layer || this.destroyed) return;
    layer.clearLayers();
    photos.forEach((photo, index) => {
      if (photo.hidden) return;
      const isSelected = index === selected;
      // DOM nodes, not an HTML string: the src never becomes markup
      let html: HTMLElement;
      let size: number;
      if (photo.src) {
        const img = document.createElement('img');
        img.className = isSelected ? 'okr-track-photo-pin selected' : 'okr-track-photo-pin';
        img.src = photo.src;
        img.alt = '';
        html = img;
        size = isSelected ? PHOTO_PIN_SELECTED_PX : PHOTO_PIN_PX;
      } else {
        html = document.createElement('div');
        html.className = isSelected ? 'okr-track-photo-dot selected' : 'okr-track-photo-dot';
        size = isSelected ? PHOTO_DOT_SELECTED_PX : PHOTO_DOT_PX;
      }
      const icon = Lf.divIcon({ className: 'okr-track-dot-icon', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      Lf.marker([photo.lat, photo.lng], { icon, interactive: false, keyboard: false, zIndexOffset: isSelected ? 1000 : 0 }).addTo(layer);
    });
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
    this.photoLayer = undefined;
  }
}
