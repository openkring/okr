import { Component, DestroyRef, ElementRef, PLATFORM_ID, effect, inject, input, output, signal, viewChild } from '@angular/core';
import type * as L from 'leaflet';

import { isBrowser } from '@okr/shared-util-angular';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface MapMarker extends GeoCoordinates {
  title?: string;
  what3words?: string;
  distance?: number; // distance in km from a reference point
  inRoute?: boolean; // with `route`: false keeps this pin off the polyline (default: on it)
}

/**
 * The tile source of an `okr-leaflet-map`: swisstopo (default), OpenStreetMap, or a custom source
 * (e.g. the travel journal's own or offline tiles, spec 1.113 §9.4).
 */
export type LeafletTiles = 'swisstopo' | 'osm' | { url: string; attribution: string; maxZoom?: number };

interface TileSource { url: string; attribution: string; maxZoom: number }

const TILE_SOURCES: Record<'swisstopo' | 'osm', TileSource> = {
  swisstopo: {
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    attribution: '© swisstopo',
    maxZoom: 19,
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  },
};

function tileSourceOf(tiles: LeafletTiles): TileSource {
  if (typeof tiles === 'string') return TILE_SOURCES[tiles] ?? TILE_SOURCES.swisstopo;
  return { url: tiles.url, attribution: tiles.attribution, maxZoom: tiles.maxZoom ?? 19 };
}

const FIT_PADDING: [number, number] = [40, 40];
const MAX_FIT_ZOOM = 16;
const PIN_STYLE_ID = 'okr-map-view-pin-styles';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

/**
 * An inline Leaflet map with labelled pins, optionally connected by a polyline (`route`).
 * Leaflet itself is loaded with a dynamic `import()` on first render, so importing this component
 * statically does NOT pull Leaflet into the importer's chunk (see the `lazy-loading` skill).
 * The host has no intrinsic height: give it one (the parent's height, or an explicit one).
 */
@Component({
  selector: 'okr-leaflet-map',
  standalone: true,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .okr-leaflet-map { width: 100%; height: 100%; }
  `],
  template: `<div #mapContainer class="okr-leaflet-map"></div>`,
})
export class LeafletMap {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('mapContainer');

  // inputs
  public markers = input<MapMarker[]>([]);
  public route = input(false); // draw a polyline through the markers in input order
  public tiles = input<LeafletTiles>('swisstopo');
  public zoom = input(15); // zoom when a single marker is shown
  public fallbackLabel = input(''); // pin label of a marker without a title

  // outputs
  public markerClick = output<MapMarker>();

  private leaflet?: typeof import('leaflet');
  private readonly map = signal<L.Map | undefined>(undefined);
  private tileLayer?: L.TileLayer;
  private markerLayer?: L.LayerGroup;
  private destroyed = false;
  /** the coordinates last fitted — a re-emission with the same pins keeps the user's pan/zoom */
  private fittedKey = '';

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.map()?.remove();
    });

    // create the map once the container is in the DOM
    effect(() => {
      const el = this.container().nativeElement;
      if (!isBrowser(this.platformId) || this.map()) return;
      void this.initMap(el);
    });

    // tiles: (re)attach the tile layer
    effect(() => {
      const map = this.map();
      const source = tileSourceOf(this.tiles());
      if (!map || !this.leaflet) return;
      this.tileLayer?.remove();
      this.tileLayer = this.leaflet.tileLayer(source.url, { maxZoom: source.maxZoom, attribution: source.attribution }).addTo(map);
    });

    // markers / route: re-render — read every signal before the early return
    effect(() => {
      const map = this.map();
      const markers = this.markers();
      const route = this.route();
      const zoom = this.zoom();
      const fallback = this.fallbackLabel();
      if (!map || !this.leaflet) return;
      this.renderMarkers(this.leaflet, map, markers, route, zoom, fallback);
    });
  }

  private async initMap(el: HTMLElement): Promise<void> {
    if (!this.leaflet) {
      // leaflet is CJS: the production (esbuild) chunk exposes it only as `default`,
      // while dev serve (vite prebundling) exposes named exports — unwrap to support both.
      const mod = await import('leaflet');
      this.leaflet = (mod as { default?: typeof import('leaflet') }).default ?? mod;
    }
    if (this.destroyed || this.map()) return;
    injectPinStyles();
    const map = this.leaflet.map(el);
    this.markerLayer = this.leaflet.layerGroup().addTo(map);
    this.map.set(map);

    // A modal is still animating in when this runs, so the container may not have its final size yet.
    setTimeout(() => this.map()?.invalidateSize(), 350);
  }

  private renderMarkers(L: typeof import('leaflet'), map: L.Map, markers: MapMarker[], route: boolean, zoom: number, fallback: string): void {
    if (!this.markerLayer) return;
    this.markerLayer.clearLayers();

    const latLngs: L.LatLngExpression[] = [];
    for (const marker of markers) {
      const label = escapeHtml(marker.title || fallback);
      const icon = L.divIcon({
        className: 'okr-pin-icon',
        html: `<div class="okr-pin"><div class="okr-pin-marker"></div><div class="okr-pin-label">${label}</div></div>`,
        iconSize: [140, 52],
        iconAnchor: [70, 24], // pin tip (centre-x, ~bottom of the 24px marker) sits on the coordinate
      });
      const leafletMarker = L.marker([marker.lat, marker.lng], { icon });
      leafletMarker.on('click', () => this.markerClick.emit(marker));
      leafletMarker.addTo(this.markerLayer);
      latLngs.push([marker.lat, marker.lng]);
    }

    const routeLatLngs = markers.filter(m => m.inRoute !== false).map((m): L.LatLngExpression => [m.lat, m.lng]);
    if (route && routeLatLngs.length > 1) {
      // the line sits in the overlay pane, below the marker pane: pins stay on top and clickable
      L.polyline(routeLatLngs, { className: 'okr-route-line', weight: 3, opacity: 0.8 }).addTo(this.markerLayer);
    }

    const key = `${zoom}|${markers.map(m => `${m.lat},${m.lng}`).join(';')}`;
    if (key === this.fittedKey) return;
    this.fittedKey = key;
    if (latLngs.length > 1) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM });
    } else if (latLngs.length === 1) {
      map.setView(latLngs[0], zoom);
    }
  }
}

/**
 * Injects the marker styles globally. Leaflet renders divIcon HTML inside its own panes, outside the
 * component's view encapsulation, so the pin styles cannot live in the component `styles`.
 */
function injectPinStyles(): void {
  if (document.getElementById(PIN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PIN_STYLE_ID;
  style.textContent = [
    '.okr-pin { display: flex; flex-direction: column; align-items: center; }',
    '.okr-pin-marker { position: relative; width: 22px; height: 22px; background: var(--ion-color-primary, #3880ff); border: 2.5px solid #fff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 2px 6px rgba(0,0,0,0.45); }',
    '.okr-pin-marker::after { content: ""; position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; background: #fff; border-radius: 50%; transform: translate(-50%, -50%); }',
    '.okr-pin-label { margin-top: 5px; font-size: 12px; font-weight: 600; color: #222; white-space: nowrap; text-align: center; text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff; }',
    '.okr-route-line { stroke: var(--ion-color-primary, #3880ff); }',
  ].join('\n');
  document.head.appendChild(style);
}
