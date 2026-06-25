import { AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import type * as L from 'leaflet';

import { isBrowser } from '@bk2/shared-util-angular';

import { Header } from './header';
import { MapMarkerDetail, MapMarkerDetailI18n } from './map-marker-detail';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface MapMarker extends GeoCoordinates {
  title?: string;
  what3words?: string;
  distance?: number; // distance in km from a reference point
}

const SWISSTOPO_TILES = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
const FIT_PADDING: [number, number] = [40, 40];
const MAX_FIT_ZOOM = 16;
const PIN_STYLE_ID = 'bk-map-view-pin-styles';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

@Component({
  selector: 'bk-map-view-modal',
  standalone: true,
  styles: [`
    .map-wrap { position: relative; width: 100%; height: 100%; }
    #bk-map-view-map { width: 100%; height: 100%; }
    bk-map-marker-detail { position: absolute; inset: 0; z-index: 1000; }
  `],
  imports: [
    Header, MapMarkerDetail,
    IonContent
  ],
  template: `
      <bk-header [i18n]="{ title: title() }" [isModal]="true" />
      <ion-content [scrollY]="false">
        <div class="map-wrap">
          <div id="bk-map-view-map"></div>
          @if (selectedMarker(); as marker) {
            <bk-map-marker-detail [marker]="marker" [i18n]="detailLabels()" (closed)="closeDetail()" />
          }
        </div>
      </ion-content>
  `
})
export class MapViewModal implements AfterViewInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly el = inject(ElementRef);

  // inputs
  public center = input.required<MapMarker>(); // camera centre and first marker
  public markers = input<MapMarker[]>([]); // additional markers
  public title = input.required<string>(); // modal header title
  public detailLabels = input<Partial<MapMarkerDetailI18n>>({}); // optional label overrides for the pin-detail panel
  public zoom = input(15); // initial zoom when a single marker is shown

  // The marker whose detail panel is currently shown (null = map view). Rendered as an in-modal
  // overlay; Leaflet is plain DOM so it neither occludes nor swallows the panel's clicks.
  protected selectedMarker = signal<MapMarker | null>(null);

  private leaflet?: typeof import('leaflet');
  private map?: L.Map;
  private markerLayer?: L.LayerGroup;

  async ngAfterViewInit(): Promise<void> {
    if (!isBrowser(this.platformId)) return;
    await this.initMap();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private async initMap(): Promise<void> {
    const L = this.leaflet ??= await import('leaflet');
    const _container = this.el.nativeElement.querySelector('#bk-map-view-map') as HTMLElement | null;
    if (!_container) return;

    this.injectPinStyles();
    this.map = L.map(_container);
    L.tileLayer(SWISSTOPO_TILES, { maxZoom: 19, attribution: '© swisstopo' }).addTo(this.map);
    this.markerLayer = L.layerGroup().addTo(this.map);
    this.renderMarkers(L);

    // The modal is still animating in when this runs, so the container may not have its final size yet.
    setTimeout(() => this.map?.invalidateSize(), 350);
  }

  private renderMarkers(L: typeof import('leaflet')): void {
    if (!this.map || !this.markerLayer) return;
    this.markerLayer.clearLayers();

    const _all = [this.center(), ...this.markers()];
    const _latLngs: L.LatLngExpression[] = [];
    for (const _marker of _all) {
      const _label = escapeHtml(_marker.title ?? this.title());
      const _icon = L.divIcon({
        className: 'bk-pin-icon',
        html: `<div class="bk-pin"><div class="bk-pin-marker"></div><div class="bk-pin-label">${_label}</div></div>`,
        iconSize: [140, 52],
        iconAnchor: [70, 24], // pin tip (centre-x, ~bottom of the 24px marker) sits on the coordinate
      });
      const _leafletMarker = L.marker([_marker.lat, _marker.lng], { icon: _icon });
      _leafletMarker.on('click', () => this.openDetail(_marker));
      _leafletMarker.addTo(this.markerLayer);
      _latLngs.push([_marker.lat, _marker.lng]);
    }

    if (_latLngs.length > 1) {
      this.map.fitBounds(L.latLngBounds(_latLngs), { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM });
    } else {
      const _center = this.center();
      this.map.setView([_center.lat, _center.lng], this.zoom());
    }
  }

  protected openDetail(marker: MapMarker): void {
    this.selectedMarker.set(marker);
  }

  protected closeDetail(): void {
    this.selectedMarker.set(null);
  }

  /**
   * Injects the marker styles globally. Leaflet renders divIcon HTML inside its own panes, outside this
   * component's view encapsulation, so the pin styles cannot live in the component `styles`.
   */
  private injectPinStyles(): void {
    if (document.getElementById(PIN_STYLE_ID)) return;
    const _style = document.createElement('style');
    _style.id = PIN_STYLE_ID;
    _style.textContent = [
      '.bk-pin { display: flex; flex-direction: column; align-items: center; }',
      '.bk-pin-marker { position: relative; width: 22px; height: 22px; background: var(--ion-color-primary, #3880ff); border: 2.5px solid #fff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 2px 6px rgba(0,0,0,0.45); }',
      '.bk-pin-marker::after { content: ""; position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; background: #fff; border-radius: 50%; transform: translate(-50%, -50%); }',
      '.bk-pin-label { margin-top: 5px; font-size: 12px; font-weight: 600; color: #222; white-space: nowrap; text-align: center; text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff; }',
    ].join('\n');
    document.head.appendChild(_style);
  }
}
