import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, output, untracked, ViewEncapsulation } from '@angular/core';
import type * as L from 'leaflet';
import type { TransportMode } from '@okr/shared-models';
import { fanOutOffsets, isTransitMode, TRACK_MODE_COLOR, type TrackPoint } from '@okr/mobility-tracker-util';

/** `route`: the line from the timetable (spec 1.129 §4.2), drawn instead of the recorded points when it has two or more */
export interface TrackMapSection { mode: TransportMode; points: TrackPoint[]; route?: { lat: number; lng: number }[] }
/** A photo pin: `src` is a displayable URL (local file or data URL); without one a small camera dot is drawn. */
export interface TrackMapPhoto { lat: number; lng: number; src?: string; hidden: boolean }
/** A point of the track: index into `sections` and into that section's points. */
export interface TrackMapPoint { section: number; index: number }

const TILE_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
const FIT_PADDING: L.PointTuple = [32, 32];
const SINGLE_POINT_ZOOM = 15;
const MAX_FIT_ZOOM = 17;
const DEFAULT_VIEW: L.LatLngExpression = [46.8, 8.2]; // Switzerland, until the first point arrives
const PHOTO_PIN_PX = 32;
const PHOTO_DOT_PX = 16;
const PHOTO_PIN_SELECTED_PX = 46;
const PHOTO_DOT_SELECTED_PX = 22;
const SELECTED_MIN_ZOOM = 16;
/** pins whose centres are closer than this (px) fan out around their common centre */
const PHOTO_FAN_THRESHOLD_PX = 24;
/** a tap selects the nearest track point at most this far away (px); farther clears the selection */
const PICK_RADIUS_PX = 40;
/** dimmed base map, so the coloured track stands out (over a white background, also in dark mode) */
const TILE_OPACITY = 0.55;
const MAX_ZOOM = 19;
/** highest zoom the swisstopo layer is requested at (level 19 exists, checked 2026-10-27); above it Leaflet scales the tiles up */
const SWISSTOPO_MAX_NATIVE_ZOOM = 19;
/**
 * user input on the map container that ends the automatic re-fitting; listened to in the capture phase, because
 * Leaflet's zoom buttons stop the propagation of their own mousedown/touchstart
 */
const USER_MOVE_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'wheel', 'keydown'] as const;
const USER_MOVE_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

type MapFit = { bounds: L.LatLngBounds } | { center: L.LatLngTuple };

/**
 * The recorded track on a swisstopo map: one polyline per section in the colour of its transport mode
 * (plane dashed; train, bus and ship dashed until their line from the timetable is known — then that line), a start and an end dot, and a round thumbnail pin per visible photo (hidden photos are not drawn;
 * photos live in their own layer, so a new thumbnail never redraws or refits the track). Fits to the data on first data and whenever the number of
 * sections changes; with `live` the map follows the last point without touching the zoom.
 * Leaflet is loaded lazily on first render (its stylesheet is global in the apps).
 * `selectedPhoto` (index into `photos`) pans the map to that pin (zoom at least 16) and draws it enlarged; undefined
 * clears the highlight without moving the map.
 * Height: CSS variable `--okr-track-map-height` (default max(280px, 50vh)).
 * The base map is dimmed (opacity 0.55 over white). A container that is resized — a modal animating in, an
 * orientation change — re-fits to the last fit (or re-centres on the selected photo) until the user touches the map;
 * going from 0 to a real size always re-fits once.
 * `detailBoost` draws the tiles of the next finer zoom level at half size: the same area, finer detail and smaller
 * labels (for the small diary card).
 * Photo pins at (nearly) the same place fan out on a small circle, recomputed per zoom level. With
 * `photosClickable` a pin is a button and emits `photoClicked` (index into `photos`); `wheelZoom` false leaves the
 * mouse wheel to the page that scrolls around the map (zoom stays on the buttons, double-click and pinch).
 * With `pickable` (spec 1.129 §5.1) a tap on the map emits `pointPicked`: the nearest track point within 40 px, or
 * undefined for a tap away from the line. The page marks the selection through `highlight`.
 */
@Component({
  selector: 'okr-track-map',
  encapsulation: ViewEncapsulation.None, // the dots are created by Leaflet outside the component view
  styles: [`
    okr-track-map { display: block; position: relative; overflow: hidden; width: 100%;
      height: var(--okr-track-map-height, max(280px, 50vh)); background: #fff; }
    okr-track-map .okr-track-map-canvas, okr-track-map .okr-track-map-canvas.leaflet-container { position: absolute; inset: 0;
      background: #fff; }
    .okr-track-dot-icon { background: transparent; border: none; }
    .okr-track-dot { width: 14px; height: 14px; border-radius: 50%; border: 3px solid #fff; box-sizing: border-box;
      box-shadow: 0 0 3px rgba(0,0,0,.6); }
    .okr-track-dot.start { background: #2e7d32; }
    .okr-track-dot.end { background: #c62828; }
    .okr-track-dot.here { background: #1565c0; width: 16px; height: 16px; }
    /* a fixed round frame around the img: global img rules (height:auto, max-width) can never make it an ellipse */
    .okr-track-photo-pin { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #fff; box-sizing: border-box;
      box-shadow: 0 0 3px rgba(0,0,0,.6); overflow: hidden; background: #fff; }
    .okr-track-photo-pin img { width: 100% !important; height: 100% !important; max-width: none !important;
      max-height: none !important; object-fit: cover; display: block; border-radius: 50%; }
    .okr-track-photo-clickable { cursor: pointer; }
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
  /** tiles of the next zoom level at half size: same area, finer detail, smaller labels; read once at init */
  public readonly detailBoost = input(false);
  /** photo pins are buttons and emit `photoClicked`; read once at init */
  public readonly photosClickable = input(false);
  /** false: the mouse wheel scrolls the page instead of zooming the map; read once at init */
  public readonly wheelZoom = input(true);
  /** a spot to mark (the point under the finger on the height profile, spec 1.128); undefined = none. Never moves the map. */
  public readonly highlight = input<{ lat: number; lng: number } | undefined>(undefined);
  /** a tap selects the nearest track point (`pointPicked`); read once at init */
  public readonly pickable = input(false);

  /** a tapped photo pin, as index into `photos` (only with `photosClickable`) */
  public readonly photoClicked = output<number>();
  /** the track point nearest to a tap (only with `pickable`); undefined for a tap away from the line */
  public readonly pointPicked = output<TrackMapPoint | undefined>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private leaflet?: typeof L;
  private map?: L.Map;
  private overlay?: L.LayerGroup;
  private photoLayer?: L.LayerGroup;
  private highlightMarker?: L.Marker;
  private resizeObserver?: ResizeObserver;
  private destroyed = false;
  private fitted = false;
  private lastSectionCount = -1;
  /** the last automatic fit, repeated on resize until the user moves the map */
  private lastFit?: MapFit;
  private userMoved = false;
  private wasEmpty = true;
  /** the container had a real size at least once — later 0 → size changes are re-shows (Ionic display:none) */
  private shownOnce = false;
  /** the last point of the track, where a re-shown live map pans to */
  private lastPoint?: L.LatLngTuple;
  private readonly onUserMove = (): void => { this.userMoved = true; };

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
    effect(() => {
      const at = this.highlight();
      if (this.map) this.renderHighlight(at);
    });
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  private renderHighlight(at: { lat: number; lng: number } | undefined): void {
    const Lf = this.leaflet;
    if (!Lf || !this.map || this.destroyed) return;
    if (!at) {
      this.highlightMarker?.remove();
      this.highlightMarker = undefined;
      return;
    }
    if (this.highlightMarker) {
      this.highlightMarker.setLatLng([at.lat, at.lng]);
      return;
    }
    const icon = Lf.divIcon({ className: 'okr-track-dot-icon', html: '<div class="okr-track-dot here"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
    this.highlightMarker = Lf.marker([at.lat, at.lng], { icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(this.map);
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
    this.map = this.leaflet.map(container, { zoomControl: true, attributionControl: true, scrollWheelZoom: this.wheelZoom() });
    // boosted: map zoom z requests tiles of z + 1, so the native cap is one level lower
    const tiles: L.TileLayerOptions = this.detailBoost()
      ? { tileSize: 128, zoomOffset: 1, maxNativeZoom: SWISSTOPO_MAX_NATIVE_ZOOM - 1 }
      : { maxNativeZoom: SWISSTOPO_MAX_NATIVE_ZOOM };
    this.leaflet.tileLayer(TILE_URL, { ...tiles, maxZoom: MAX_ZOOM, opacity: TILE_OPACITY, attribution: '© swisstopo' }).addTo(this.map);
    for (const type of USER_MOVE_EVENTS) container.addEventListener(type, this.onUserMove, USER_MOVE_OPTIONS);
    this.overlay = this.leaflet.layerGroup().addTo(this.map);
    this.photoLayer = this.leaflet.layerGroup().addTo(this.map); // above the track
    this.map.setView(DEFAULT_VIEW, 8);
    // the fan-out is in pixels: lay the pins out again for every zoom level
    this.map.on('zoomend', () => this.renderPhotos(this.photos(), this.selectedPhoto()));
    if (this.pickable()) this.map.on('click', (e: L.LeafletMouseEvent) => this.pointPicked.emit(this.nearestPoint(e.containerPoint)));
    this.render(this.sections(), this.live());
    this.renderPhotos(this.photos(), this.selectedPhoto());
    this.panToPhoto(this.selectedPhoto());
    this.renderHighlight(this.highlight());
    this.resizeObserver = new ResizeObserver(() => this.onResize(container));
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
      const route = section.route && section.route.length > 1 ? section.route.map((p) => [p.lat, p.lng] as L.LatLngTuple) : undefined;
      // straight lines between a few fixes: dashed reads as «approximately», not as the way taken
      const dashed = section.mode === 'plane' || (!route && isTransitMode(section.mode));
      const line = route ?? latlngs;
      if (line.length > 1) {
        Lf.polyline(line, {
          color: TRACK_MODE_COLOR[section.mode], weight: 5, opacity: 0.9,
          ...(dashed ? { dashArray: '8 8' } : {}),
        }).addTo(this.overlay);
      }
    }
    this.lastPoint = all.length > 0 ? all[all.length - 1] : undefined;
    if (all.length > 0) {
      this.addDot(Lf, all[0], 'start');
      this.addDot(Lf, all[all.length - 1], 'end');
    }

    const countChanged = sections.length !== this.lastSectionCount;
    this.lastSectionCount = sections.length;
    if (all.length > 0 && (!this.fitted || countChanged)) {
      this.fitted = true;
      this.lastFit = all.length > 1 ? { bounds: Lf.latLngBounds(all) } : { center: all[0] };
      this.applyFit(this.lastFit);
    } else if (live && all.length > 0) {
      map.panTo(all[all.length - 1], { animate: true }); // pan only: the zoom stays
    }
  }

  /** programmatic: never counts as a user move */
  private applyFit(fit: MapFit): void {
    if (!this.map) return;
    if ('bounds' in fit) this.map.fitBounds(fit.bounds, { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM, animate: false });
    else this.map.setView(fit.center, SINGLE_POINT_ZOOM, { animate: false });
  }

  /**
   * Leaflet fits against the container size of the moment; inside an animating modal that is 0 or a fraction of the
   * final size. So a resize repeats the last fit (or the centring on the selected photo) until the user touched the
   * map; never afterwards. The first real size always re-fits once; a later re-show (0 → size, Ionic hides pages
   * with display:none) leaves a static map as it was and pans a live map to its last point.
   */
  private onResize(container: HTMLElement): void {
    const map = this.map;
    if (this.destroyed || !map) return;
    map.invalidateSize({ animate: false });
    const empty = container.clientWidth === 0 || container.clientHeight === 0;
    const becameVisible = this.wasEmpty && !empty;
    this.wasEmpty = empty;
    if (empty) return;
    const reShown = becameVisible && this.shownOnce;
    this.shownOnce = true;
    if (this.userMoved || !this.lastFit) return;
    if (this.live()) {
      if (reShown && this.lastPoint) map.panTo(this.lastPoint, { animate: false });
      else if (becameVisible) this.applyFit(this.lastFit);
      return;
    }
    if (reShown) return;
    const selected = this.selectedPhoto();
    const photo = selected === undefined ? undefined : this.photos()[selected];
    if (photo && !photo.hidden) map.setView([photo.lat, photo.lng], Math.max(SELECTED_MIN_ZOOM, this.fitZoom(this.lastFit)), { animate: false });
    else this.applyFit(this.lastFit);
  }

  /** the zoom `applyFit` would choose at the current container size */
  private fitZoom(fit: MapFit): number {
    if (!this.map || !('bounds' in fit)) return SINGLE_POINT_ZOOM;
    return Math.min(this.map.getBoundsZoom(fit.bounds, false, this.leaflet?.point(FIT_PADDING[0] * 2, FIT_PADDING[1] * 2)), MAX_FIT_ZOOM);
  }

  private panToPhoto(selected: number | undefined): void {
    const photo = selected === undefined ? undefined : this.photos()[selected];
    if (!this.map || this.destroyed || !photo || photo.hidden) return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.map.setView([photo.lat, photo.lng], Math.max(this.map.getZoom(), SELECTED_MIN_ZOOM), { animate: !reduced });
  }

  private renderPhotos(photos: TrackMapPhoto[], selected: number | undefined): void {
    const Lf = this.leaflet;
    const map = this.map;
    const layer = this.photoLayer;
    if (!Lf || !map || !layer || this.destroyed) return;
    layer.clearLayers();
    const shown = photos.map((photo, index) => ({ photo, index })).filter(({ photo }) => !photo.hidden);
    const offsets = fanOutOffsets(shown.map(({ photo }) => map.latLngToLayerPoint([photo.lat, photo.lng])), PHOTO_FAN_THRESHOLD_PX, PHOTO_PIN_PX);
    const clickable = this.photosClickable();
    shown.forEach(({ photo, index }, k) => {
      const isSelected = index === selected;
      // DOM nodes, not an HTML string: the src never becomes markup
      let html: HTMLElement;
      let size: number;
      if (photo.src) {
        html = document.createElement('div');
        html.className = isSelected ? 'okr-track-photo-pin selected' : 'okr-track-photo-pin';
        const img = document.createElement('img');
        img.src = photo.src;
        img.alt = '';
        html.appendChild(img);
        size = isSelected ? PHOTO_PIN_SELECTED_PX : PHOTO_PIN_PX;
      } else {
        html = document.createElement('div');
        html.className = isSelected ? 'okr-track-photo-dot selected' : 'okr-track-photo-dot';
        size = isSelected ? PHOTO_DOT_SELECTED_PX : PHOTO_DOT_PX;
      }
      const { dx, dy } = offsets[k];
      const icon = Lf.divIcon({
        className: clickable ? 'okr-track-dot-icon okr-track-photo-clickable' : 'okr-track-dot-icon',
        html, iconSize: [size, size], iconAnchor: [size / 2 - dx, size / 2 - dy],
      });
      const marker = Lf.marker([photo.lat, photo.lng], { icon, interactive: clickable, keyboard: clickable, zIndexOffset: isSelected ? 1000 : 0 });
      if (clickable) marker.on('click', () => this.photoClicked.emit(index));
      marker.addTo(layer);
    });
  }

  /** The track point nearest to a container pixel, within PICK_RADIUS_PX. */
  private nearestPoint(at: L.Point): TrackMapPoint | undefined {
    const map = this.map;
    if (!map) return undefined;
    let best: TrackMapPoint | undefined;
    let bestPx = PICK_RADIUS_PX;
    this.sections().forEach((s, section) => s.points.forEach((p, index) => {
      const px = map.latLngToContainerPoint([p.lat, p.lng]).distanceTo(at);
      if (px <= bestPx) {
        bestPx = px;
        best = { section, index };
      }
    }));
    return best;
  }

  private addDot(Lf: typeof L, at: L.LatLngTuple, kind: 'start' | 'end'): void {
    if (!this.overlay) return;
    const icon = Lf.divIcon({ className: 'okr-track-dot-icon', html: `<div class="okr-track-dot ${kind}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
    Lf.marker(at, { icon, interactive: false, keyboard: false }).addTo(this.overlay);
  }

  private teardown(): void {
    this.destroyed = true; // an init still waiting for Leaflet must not create a map afterwards
    const container = this.map?.getContainer();
    if (container) for (const type of USER_MOVE_EVENTS) container.removeEventListener(type, this.onUserMove, { capture: true });
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.map?.remove();
    this.map = undefined;
    this.overlay = undefined;
    this.photoLayer = undefined;
    this.highlightMarker = undefined;
  }
}
