import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, output, ViewEncapsulation } from '@angular/core';
import type * as L from 'leaflet';
import type * as ProtomapsLeaflet from 'protomaps-leaflet';

/**
 * A map with a dashed route line and round photo pins (travel journal overview, spec 1.113 §9.1).
 * Leaflet is loaded lazily on first render; its stylesheet is global in the apps that use it. Without a
 * tile source (offline, or tiles not yet downloaded) route and pins still show on a plain background.
 * Layers can be raster tiles or OpenStreetMap vector tiles (`kind: 'vector'`, drawn by protomaps-leaflet,
 * which is loaded only when such a layer is on the map); `bounds` limits a layer to its area.
 */
export interface RoutePin { key: string; lat: number; lng: number; thumbnailUrl?: string; label: string }
export interface TileSource {
  urlTemplate: string;
  maxNativeZoom: number;
  attribution: string;
  minZoom?: number;
  minNativeZoom?: number;
  kind?: 'raster' | 'vector';
  bounds?: [west: number, south: number, east: number, north: number];
}
/** The visible map: bounds as [west, south, east, north] and the zoom. */
export interface MapView { bounds: [number, number, number, number]; zoom: number }

const FIT_PADDING: L.PointExpression = [40, 40];
const SINGLE_POINT_ZOOM = 10;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

@Component({
  selector: 'okr-route-map',
  encapsulation: ViewEncapsulation.None, // the pin markup is created by Leaflet outside the component view
  styles: [`
    okr-route-map { display: block; position: relative; overflow: hidden; width: 100%; height: 100%; min-height: 240px;
      background: var(--ion-color-light, #dfe9ef); }
    /* positioned in whole pixels by snapToPixels(): Leaflet places tiles in whole pixels relative to
       this element, so a fractional screen position (iPad landscape: x = 394.23) showed white seams */
    okr-route-map .okr-route-map-canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
    .okr-route-pin { width: 44px; height: 44px; border-radius: 50%; border: 3px solid #fff; overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,.35); background: var(--ion-color-medium, #8aa); cursor: pointer; box-sizing: border-box; }
    .okr-route-pin img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .okr-route-pin.selected { width: 56px; height: 56px; border-color: var(--ion-color-tertiary, #13a89e); }
    .okr-route-pin-icon { background: transparent; border: none; }
  `],
  template: `<div class="okr-route-map-canvas"></div>`,
})
export class RouteMap {
  public readonly route = input<[number, number][]>([]);
  public readonly pins = input<RoutePin[]>([]);
  public readonly selectedKey = input<string | undefined>(undefined);
  /** One source or several stacked layers (e.g. an offline overview plus detail tiles from a higher zoom on). */
  public readonly tiles = input<TileSource | TileSource[] | undefined>(undefined);
  public readonly pinClicked = output<string>();
  /** After every pan or zoom: what the map shows (e.g. to save it as an offline area). */
  public readonly viewChanged = output<MapView>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private leaflet?: typeof L;
  private vectorLib?: typeof ProtomapsLeaflet;
  private vectorLoading = false;
  private map?: L.Map;
  private tileLayers: L.TileLayer[] = [];
  private overlay?: L.LayerGroup;
  private resizeObserver?: ResizeObserver;
  private lastPoints: L.LatLngExpression[] = [];
  private lastPointsKey = '';
  private lastTilesKey: string | undefined;
  private snapFrames = 0;
  private snapHandle?: number;
  private lastSnap = '';

  public constructor() {
    afterNextRender(() => void this.init());
    effect(() => {
      // re-render whenever an input changes (read all of them here so the effect tracks them)
      const state = { route: this.route(), pins: this.pins(), selected: this.selectedKey(), tiles: this.tiles() };
      if (this.map) this.render(state.route, state.pins, state.selected, state.tiles);
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.snapHandle !== undefined) cancelAnimationFrame(this.snapHandle);
      this.resizeObserver?.disconnect();
      this.map?.remove();
      this.map = undefined;
    });
  }

  private async init(): Promise<void> {
    if (!this.leaflet) {
      // leaflet is CJS: the production chunk exposes it only as `default`, dev serve as named exports
      const mod = await import('leaflet');
      this.leaflet = (mod as { default?: typeof L }).default ?? mod;
    }
    const container = (this.el.nativeElement as HTMLElement).querySelector('.okr-route-map-canvas') as HTMLElement | null;
    if (!container || this.map) return;
    this.snapToPixels(container);
    this.map = this.leaflet.map(container, { zoomControl: true, attributionControl: true });
    this.map.on('moveend', () => this.emitView());
    this.overlay = this.leaflet.layerGroup().addTo(this.map);
    this.render(this.route(), this.pins(), this.selectedKey(), this.tiles());
    this.settleSnap(container);
    // the container may still be animating or change with the layout (A/B): keep Leaflet's size in sync
    // Ionic hides a page that stays in the stack (size 0) and shows it again on «back»: refit then,
    // otherwise the map keeps the zoom it had at size 0 (device check plan 3).
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.map || !this.snapToPixels(container)) return;
      this.map.invalidateSize();
      this.fit();
      this.settleSnap(container);
    });
    this.resizeObserver.observe(this.el.nativeElement as HTMLElement);
  }

  /**
   * Aligns the Leaflet container to whole CSS pixels on the screen: offset by the fraction of the host's
   * position, size rounded down. Returns false while the host is hidden (size 0, e.g. a page kept in
   * Ionic's stack). Device check plan 3: tile seams only in iPad landscape, where the host sat at x = 394.23.
   */
  private snapToPixels(canvas: HTMLElement): boolean {
    const host = (this.el.nativeElement as HTMLElement).getBoundingClientRect();
    if (host.width === 0 || host.height === 0) return false;
    const left = Math.ceil(host.left) - host.left;
    const top = Math.ceil(host.top) - host.top;
    const snap = `${left}|${top}|${Math.floor(host.width - left)}|${Math.floor(host.height - top)}`;
    if (snap === this.lastSnap) return true;
    this.lastSnap = snap;
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.style.width = `${Math.floor(host.width - left)}px`;
    canvas.style.height = `${Math.floor(host.height - top)}px`;
    return true;
  }

  /**
   * Re-measures for ~1.5 s (90 frames): the page slides in with a transform, so the first measurement
   * sees a moving position, and a pure move (no size change) never reaches the ResizeObserver. Device
   * check plan 3: seams stayed until the iPad was rotated once.
   */
  private settleSnap(canvas: HTMLElement): void {
    this.snapFrames = 90;
    if (this.snapHandle !== undefined) return;
    const tick = (): void => {
      const before = this.lastSnap;
      if (this.snapToPixels(canvas) && this.lastSnap !== before) this.map?.invalidateSize();
      this.snapFrames -= 1;
      this.snapHandle = this.snapFrames > 0 ? requestAnimationFrame(tick) : undefined;
    };
    this.snapHandle = requestAnimationFrame(tick);
  }

  private render(route: [number, number][], pins: RoutePin[], selected: string | undefined, tiles: TileSource | TileSource[] | undefined): void {
    const Lf = this.leaflet;
    const map = this.map;
    if (!Lf || !map || !this.overlay) return;

    // rebuild the tile layer only when the source changes — not on every data change (no flicker)
    const sources = tiles === undefined ? [] : Array.isArray(tiles) ? tiles : [tiles];
    const tilesKey = sources.map((t) => `${t.kind ?? 'raster'}|${t.urlTemplate}|${t.minZoom ?? ''}|${t.minNativeZoom ?? ''}|${t.maxNativeZoom}|${t.bounds?.join(',') ?? ''}`).join(';');
    const needsVector = sources.some((t) => t.kind === 'vector');
    if (needsVector && !this.vectorLib) void this.loadVector(); // renders again once loaded
    if (tilesKey !== this.lastTilesKey && (!needsVector || this.vectorLib)) {
      this.lastTilesKey = tilesKey;
      for (const layer of this.tileLayers) layer.remove();
      this.tileLayers = sources.map((t) => {
        const bounds = t.bounds ? Lf.latLngBounds([t.bounds[1], t.bounds[0]], [t.bounds[3], t.bounds[2]]) : undefined;
        if (t.kind === 'vector' && this.vectorLib) {
          const layer = this.vectorLib.leafletLayer({
            url: t.urlTemplate, flavor: 'light', lang: 'de', maxDataZoom: t.maxNativeZoom, attribution: t.attribution,
            ...(bounds ? { bounds } : {}),
          }) as unknown as L.TileLayer;
          return layer.addTo(map);
        }
        return Lf.tileLayer(t.urlTemplate, {
          maxNativeZoom: t.maxNativeZoom, maxZoom: 16, attribution: t.attribution,
          ...(t.minZoom !== undefined ? { minZoom: t.minZoom } : {}),
          ...(t.minNativeZoom !== undefined ? { minNativeZoom: t.minNativeZoom } : {}),
          ...(bounds ? { bounds } : {}),
        }).addTo(map);
      });
    }

    this.overlay.clearLayers();
    if (route.length > 1) {
      Lf.polyline(route, { color: '#e2531d', weight: 3, dashArray: '6 6', opacity: 0.9 }).addTo(this.overlay);
    }
    for (const pin of pins) {
      const isSelected = pin.key === selected;
      const size = isSelected ? 56 : 44;
      const inner = pin.thumbnailUrl ? `<img src="${escapeHtml(pin.thumbnailUrl)}" alt="${escapeHtml(pin.label)}">` : '';
      const icon = Lf.divIcon({
        className: 'okr-route-pin-icon',
        html: `<div class="okr-route-pin${isSelected ? ' selected' : ''}" title="${escapeHtml(pin.label)}">${inner}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      Lf.marker([pin.lat, pin.lng], { icon, zIndexOffset: isSelected ? 1000 : 0 })
        .on('click', () => this.pinClicked.emit(pin.key))
        .addTo(this.overlay);
    }

    // refit only when the points change: a selection change or a sync of unrelated data must not
    // throw away the user's own pan and zoom
    const points: [number, number][] = [...route, ...pins.map((p) => [p.lat, p.lng] as [number, number])];
    const pointsKey = JSON.stringify(points);
    if (pointsKey !== this.lastPointsKey) {
      this.lastPointsKey = pointsKey;
      this.lastPoints = points;
      this.fit();
    }
  }

  private emitView(): void {
    const map = this.map;
    if (!map) return;
    const b = map.getBounds();
    this.viewChanged.emit({ bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: map.getZoom() });
  }

  /** protomaps-leaflet only when a vector layer is shown; it extends the global `L.GridLayer`. */
  private async loadVector(): Promise<void> {
    if (this.vectorLib || this.vectorLoading || !this.leaflet) return;
    this.vectorLoading = true;
    try {
      (globalThis as { L?: unknown }).L ??= this.leaflet;
      this.vectorLib = await import('protomaps-leaflet');
      this.render(this.route(), this.pins(), this.selectedKey(), this.tiles());
    } finally {
      this.vectorLoading = false;
    }
  }

  private fit(): void {
    const Lf = this.leaflet;
    if (!Lf || !this.map) return;
    const points = this.lastPoints;
    if (points.length > 1) this.map.fitBounds(Lf.latLngBounds(points), { padding: FIT_PADDING });
    else if (points.length === 1) this.map.setView(points[0], SINGLE_POINT_ZOOM);
    else this.map.setView([-60, -62], 3); // nothing yet: the route area (spec §9.4)
  }
}
