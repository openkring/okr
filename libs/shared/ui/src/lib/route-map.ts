import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, input, model, output, ViewEncapsulation } from '@angular/core';
import { ActionSheetController, IonIcon } from '@ionic/angular';
import type * as L from 'leaflet';
import type * as ProtomapsLeaflet from 'protomaps-leaflet';

import { ENV } from '@okr/shared-config';
import { SvgIconPipe } from '@okr/shared-pipes';
import { createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';

import { googleMapsLogoUrl } from './google-maps-logo';

/**
 * A map with a dashed route line and round photo pins (travel journal overview, spec 1.113 §9.1).
 * Leaflet is loaded lazily on first render; its stylesheet is global in the apps that use it. Without a
 * tile source (offline, or tiles not yet downloaded) route and pins still show on a plain background.
 * Layers can be raster tiles or OpenStreetMap vector tiles (`kind: 'vector'`, drawn by protomaps-leaflet,
 * which is loaded only when such a layer is on the map); `bounds` limits a layer to its area.
 * `places` are named points (e.g. landing sites): small dots, labelled from PLACE_LABEL_ZOOM on, never refitted to.
 *
 * Base layers (spec 1.126 phase 4, design §2): with `baseLayers`, the map draws only the selected option's sources
 * and offers a round layer button that opens an ActionSheet. While a Google option is selected it shows the official
 * Google Maps logo (bottom left) and `googleAttribution` as the attribution prefix. Without `baseLayers`, `tiles` is
 * drawn as before. The OpenStreetMap sea is transparent (design §6), so satellite or background tiles show through.
 */
export interface RoutePin { key: string; lat: number; lng: number; thumbnailUrl?: string; label: string }
export interface RoutePlace { name: string; lat: number; lng: number }
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
/** One selectable base layer: the shared-ui mirror of the journal's `BaseLayerOption`, plus its label. */
export interface RouteBaseLayer { id: string; label: string; sources: TileSource[]; googleType?: 'roadmap' | 'satellite' }

const FIT_PADDING: L.PointExpression = [40, 40];
const SINGLE_POINT_ZOOM = 10;
const PLACE_LABEL_ZOOM = 7; // below, the labels of a whole island group would overlap
/** Raster and offline layers stop here (unchanged); Google layers follow their native levels up to GOOGLE_MAX_ZOOM. */
const DEFAULT_MAX_ZOOM = 16;
const GOOGLE_MAX_ZOOM = 20;
/** A missing or zero-byte raster tile (empty-tile marker, design §5) draws nothing instead of a broken image. */
/** `googleTileError` fires at most once per map type in this interval (the caller renews the session). */
const GOOGLE_TILE_ERROR_MS = 60 * 1000;
const TRANSPARENT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

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
    .okr-route-place { width: 10px; height: 10px; border-radius: 50%; border: 2px solid #fff; box-sizing: border-box;
      background: var(--ion-color-primary, #1d4e89); box-shadow: 0 0 2px rgba(0,0,0,.5); }
    .leaflet-tooltip.okr-route-place-label { background: transparent; border: none; box-shadow: none; padding: 0 0 0 4px;
      font-size: 12px; font-weight: 600; color: #fff; text-shadow: 0 0 3px #000, 0 0 2px #000; }
    .leaflet-tooltip.okr-route-place-label::before { display: none; }
    .okr-route-map-far .okr-route-place-label { display: none; }
    /* Google guidelines: 16–19 px high, clear space 10 px left/right/top and 5 px below, never covered */
    okr-route-map .okr-route-map-google-logo { position: absolute; left: 10px; bottom: 5px; z-index: 1000;
      height: 18px; width: calc(18px * 105 / 22); pointer-events: none; }
    /* the attribution (bottom right) may wrap but never runs under the Google logo */
    okr-route-map.okr-route-map-google .leaflet-bottom.leaflet-right { max-width: calc(100% - 116px); }
    /* top right: above Leaflet's attribution, away from the Google logo and the zoom control (top left) */
    okr-route-map .okr-route-map-layers { position: absolute; right: 10px; top: 10px; z-index: 1000;
      width: 36px; height: 36px; padding: 0; border: none; border-radius: 50%; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      background: #fff; color: #333; box-shadow: 0 1px 5px rgba(0,0,0,.4); }
    okr-route-map .okr-route-map-layers ion-icon { font-size: 20px; }
  `],
  host: { '[class.okr-route-map-google]': 'googleLogo() !== undefined' },
  imports: [IonIcon, SvgIconPipe],
  template: `
    <div class="okr-route-map-canvas"></div>
    @if (googleLogo(); as logo) {
      <img class="okr-route-map-google-logo" [src]="logo" alt="Google Maps" />
    }
    @if (baseLayers().length > 1) {
      <button type="button" class="okr-route-map-layers" [attr.aria-label]="layerSwitchLabel()" [title]="layerSwitchLabel()"
        (click)="chooseBaseLayer()">
        <ion-icon src="{{ 'map' | svgIcon }}" />
      </button>
    }
  `,
})
export class RouteMap {
  public readonly route = input<[number, number][]>([]);
  public readonly pins = input<RoutePin[]>([]);
  public readonly selectedKey = input<string | undefined>(undefined);
  /** One source or several stacked layers (e.g. an offline overview plus detail tiles from a higher zoom on). */
  public readonly tiles = input<TileSource | TileSource[] | undefined>(undefined);
  public readonly places = input<RoutePlace[]>([]);
  /** The base layers to choose from; when empty, `tiles` is drawn (other users of the map). */
  public readonly baseLayers = input<RouteBaseLayer[]>([]);
  /** The chosen base layer; an unknown or missing id draws the first option. */
  public readonly selectedBaseId = model<string | undefined>(undefined);
  /** The header of the layer ActionSheet (i18n from the caller). */
  public readonly layerSwitchLabel = input('');
  /** The viewport copyright of the Google layer (fetched by the caller), shown while a Google option is selected. */
  public readonly googleAttribution = input('');
  public readonly pinClicked = output<string>();
  /** After every pan or zoom: what the map shows (e.g. to save it as an offline area). */
  public readonly viewChanged = output<MapView>();
  /**
   * A tile of the selected Google layer failed to load (e.g. the session expired, design §1): at most once per 60 s per
   * map type, so the caller can renew the session once instead of on every broken tile.
   */
  public readonly googleTileError = output<'roadmap' | 'satellite'>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly env = inject(ENV);

  protected readonly selectedBase = computed(() => {
    const layers = this.baseLayers();
    const id = this.selectedBaseId();
    return layers.find((l) => l.id === id) ?? layers[0];
  });
  /** What the map draws: the selected base layer, else `tiles`. */
  private readonly activeSources = computed<TileSource[]>(() => {
    if (this.baseLayers().length > 0) return this.selectedBase()?.sources ?? [];
    const tiles = this.tiles();
    return tiles === undefined ? [] : Array.isArray(tiles) ? tiles : [tiles];
  });
  protected readonly googleLogo = computed(() => {
    const type = this.selectedBase()?.googleType;
    return type ? googleMapsLogoUrl(type) : undefined;
  });
  private defaultPrefix: string | false = false;
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
  private destroyed = false;
  private readonly lastGoogleTileError: Record<'roadmap' | 'satellite', number> = { roadmap: 0, satellite: 0 };

  public constructor() {
    afterNextRender(() => void this.init());
    effect(() => {
      // re-render whenever an input changes (read all of them here so the effect tracks them)
      const state = { route: this.route(), pins: this.pins(), selected: this.selectedKey(), tiles: this.activeSources(), places: this.places() };
      if (this.map) this.render(state.route, state.pins, state.selected, state.tiles, state.places);
    });
    effect(() => {
      const google = this.selectedBase()?.googleType !== undefined;
      const copyright = this.googleAttribution();
      if (this.map) this.updateAttribution(google, copyright);
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true; // an init still waiting for Leaflet must not create a map afterwards
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
    if (this.destroyed || !container || this.map) return;
    this.snapToPixels(container);
    this.map = this.leaflet.map(container, { zoomControl: true, attributionControl: true });
    this.map.on('moveend', () => this.emitView());
    this.map.on('zoomend', () => this.markFar());
    this.overlay = this.leaflet.layerGroup().addTo(this.map);
    const prefix = this.map.attributionControl?.options.prefix;
    this.defaultPrefix = typeof prefix === 'string' ? prefix : false;
    this.updateAttribution(this.selectedBase()?.googleType !== undefined, this.googleAttribution());
    this.render(this.route(), this.pins(), this.selectedKey(), this.activeSources(), this.places());
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

  private render(
    route: [number, number][], pins: RoutePin[], selected: string | undefined, sources: TileSource[], places: RoutePlace[],
  ): void {
    const Lf = this.leaflet;
    const map = this.map;
    if (!Lf || !map || !this.overlay) return;

    // rebuild the tile layer only when the source changes — not on every data change (no flicker)
    // Google follows its native levels (beyond z16); every other source keeps the fixed limit
    const maxZoom = this.selectedBase()?.googleType
      ? Math.min(GOOGLE_MAX_ZOOM, Math.max(DEFAULT_MAX_ZOOM, ...sources.map((t) => t.maxNativeZoom)))
      : DEFAULT_MAX_ZOOM;
    const tilesKey = `${maxZoom}#` + sources.map((t) => `${t.kind ?? 'raster'}|${t.urlTemplate}|${t.minZoom ?? ''}|${t.minNativeZoom ?? ''}|${t.maxNativeZoom}|${t.bounds?.join(',') ?? ''}`).join(';');
    const needsVector = sources.some((t) => t.kind === 'vector');
    if (needsVector && !this.vectorLib) void this.loadVector(); // renders again once loaded
    if (tilesKey !== this.lastTilesKey && (!needsVector || this.vectorLib)) {
      this.lastTilesKey = tilesKey;
      for (const layer of this.tileLayers) layer.remove();
      const googleType = this.selectedBase()?.googleType;
      this.tileLayers = sources.map((t) => {
        const bounds = t.bounds ? Lf.latLngBounds([t.bounds[1], t.bounds[0]], [t.bounds[3], t.bounds[2]]) : undefined;
        if (t.kind === 'vector' && this.vectorLib) return this.vectorLayer(this.vectorLib, t, bounds).addTo(map);
        const layer = Lf.tileLayer(t.urlTemplate, {
          maxNativeZoom: t.maxNativeZoom, maxZoom, attribution: t.attribution, errorTileUrl: TRANSPARENT_PNG,
          ...(t.minZoom !== undefined ? { minZoom: t.minZoom } : {}),
          ...(t.minNativeZoom !== undefined ? { minNativeZoom: t.minNativeZoom } : {}),
          ...(bounds ? { bounds } : {}),
        });
        if (googleType) layer.on('tileerror', () => this.onGoogleTileError(googleType));
        return layer.addTo(map);
      });
    }

    this.overlay.clearLayers();
    if (route.length > 1) {
      Lf.polyline(route, { color: '#e2531d', weight: 3, dashArray: '6 6', opacity: 0.9 }).addTo(this.overlay);
    }
    const placeIcon = Lf.divIcon({ className: 'okr-route-pin-icon', html: '<div class="okr-route-place"></div>', iconSize: [10, 10], iconAnchor: [5, 5] });
    for (const place of places) {
      Lf.marker([place.lat, place.lng], { icon: placeIcon, interactive: false, keyboard: false, zIndexOffset: -1000 })
        .bindTooltip(escapeHtml(place.name), { permanent: true, direction: 'right', offset: [4, 0], className: 'okr-route-place-label' })
        .addTo(this.overlay);
    }
    this.markFar();
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

  /**
   * An OpenStreetMap vector layer with a transparent sea (design §6): the light flavour without its water polygons
   * and without a background fill, so the satellite or background tiles below show through. The rules are filtered on
   * the built layer because `paintRules(flavor)` needs the flavour object of `@protomaps/basemaps`, which is not a
   * dependency of ours. A zero-byte `.mvt` (empty-tile marker, design §5) decodes as a tile without layers: it draws
   * nothing and throws nothing (checked against protomaps-leaflet 5.1.0, `parseTile` on an empty buffer).
   */
  private vectorLayer(lib: typeof ProtomapsLeaflet, t: TileSource, bounds: L.LatLngBounds | undefined): L.TileLayer {
    const layer = lib.leafletLayer({
      url: t.urlTemplate, flavor: 'light', lang: 'de', maxDataZoom: t.maxNativeZoom, attribution: t.attribution,
      ...(bounds ? { bounds } : {}),
    }) as unknown as L.TileLayer & { paintRules: ProtomapsLeaflet.PaintRule[]; backgroundColor?: string };
    layer.paintRules = layer.paintRules.filter((r) => !(r.dataLayer === 'water' && r.symbolizer instanceof lib.PolygonSymbolizer));
    layer.backgroundColor = undefined;
    return layer;
  }

  /** While a Google layer is shown, its viewport copyright replaces Leaflet's prefix; otherwise the prefix is restored. */
  private updateAttribution(google: boolean, copyright: string): void {
    const control = this.map?.attributionControl;
    if (!control) return;
    control.setPrefix(google ? escapeHtml(copyright) : this.defaultPrefix);
  }

  /** The ActionSheet with the base layers, the current one checked; the choice goes to `selectedBaseId`. */
  protected async chooseBaseLayer(): Promise<void> {
    const layers = this.baseLayers();
    const current = this.selectedBase()?.id;
    const imgixBaseUrl = this.env.services.imgixBaseUrl;
    const options = createActionSheetOptions(this.layerSwitchLabel());
    for (const layer of layers) {
      options.buttons.push(createActionSheetButton(`baselayer.${layer.id}`, layer.label, imgixBaseUrl,
        layer.id === current ? 'checkbox-circle' : 'radio-button-off'));
    }
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss<{ action?: string }>();
    const id = data?.action?.replace(/^baselayer\./, '');
    if (id && id !== current && layers.some((l) => l.id === id)) this.selectedBaseId.set(id);
  }

  private onGoogleTileError(type: 'roadmap' | 'satellite'): void {
    const now = Date.now();
    if (now - this.lastGoogleTileError[type] < GOOGLE_TILE_ERROR_MS) return;
    this.lastGoogleTileError[type] = now;
    this.googleTileError.emit(type);
  }

  /** Place labels only from PLACE_LABEL_ZOOM on (a class on the container, so no re-render on zoom). */
  private markFar(): void {
    if (!this.map) return;
    this.map.getContainer().classList.toggle('okr-route-map-far', this.map.getZoom() < PLACE_LABEL_ZOOM);
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
      this.render(this.route(), this.pins(), this.selectedKey(), this.activeSources(), this.places());
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
