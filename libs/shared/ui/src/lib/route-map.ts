import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, output, ViewEncapsulation } from '@angular/core';
import type * as L from 'leaflet';

/**
 * A map with a dashed route line and round photo pins (travel journal overview, spec 1.113 §9.1).
 * Leaflet is loaded lazily on first render; its stylesheet is global in the apps that use it. Without a
 * tile source (offline, or tiles not yet downloaded) route and pins still show on a plain background.
 */
export interface RoutePin { key: string; lat: number; lng: number; thumbnailUrl?: string; label: string }
export interface TileSource { urlTemplate: string; maxNativeZoom: number; attribution: string }

const FIT_PADDING: L.PointExpression = [40, 40];
const SINGLE_POINT_ZOOM = 10;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

@Component({
  selector: 'okr-route-map',
  encapsulation: ViewEncapsulation.None, // the pin markup is created by Leaflet outside the component view
  styles: [`
    okr-route-map { display: block; width: 100%; height: 100%; }
    okr-route-map .okr-route-map-canvas { width: 100%; height: 100%; min-height: 240px; background: var(--ion-color-light, #dfe9ef); }
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
  public readonly tiles = input<TileSource | undefined>(undefined);
  public readonly pinClicked = output<string>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private leaflet?: typeof L;
  private map?: L.Map;
  private tileLayer?: L.TileLayer;
  private overlay?: L.LayerGroup;
  private resizeObserver?: ResizeObserver;
  private lastPoints: L.LatLngExpression[] = [];

  public constructor() {
    afterNextRender(() => void this.init());
    effect(() => {
      // re-render whenever an input changes (read all of them here so the effect tracks them)
      const state = { route: this.route(), pins: this.pins(), selected: this.selectedKey(), tiles: this.tiles() };
      if (this.map) this.render(state.route, state.pins, state.selected, state.tiles);
    });
    inject(DestroyRef).onDestroy(() => {
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
    this.map = this.leaflet.map(container, { zoomControl: true, attributionControl: true });
    this.overlay = this.leaflet.layerGroup().addTo(this.map);
    this.render(this.route(), this.pins(), this.selectedKey(), this.tiles());
    // the container may still be animating or change with the layout (A/B): keep Leaflet's size in sync
    // Ionic hides a page that stays in the stack (size 0) and shows it again on «back»: refit then,
    // otherwise the map keeps the zoom it had at size 0 (device check plan 3).
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.map || container.clientWidth === 0 || container.clientHeight === 0) return;
      this.map.invalidateSize();
      this.fit();
    });
    this.resizeObserver.observe(container);
  }

  private render(route: [number, number][], pins: RoutePin[], selected: string | undefined, tiles: TileSource | undefined): void {
    const Lf = this.leaflet;
    if (!Lf || !this.map || !this.overlay) return;

    this.tileLayer?.remove();
    this.tileLayer = tiles
      ? Lf.tileLayer(tiles.urlTemplate, { maxNativeZoom: tiles.maxNativeZoom, maxZoom: 16, attribution: tiles.attribution }).addTo(this.map)
      : undefined;

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

    this.lastPoints = [...route, ...pins.map((p) => [p.lat, p.lng] as [number, number])];
    this.fit();
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
