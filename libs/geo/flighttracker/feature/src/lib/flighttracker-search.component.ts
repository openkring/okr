import { AsyncPipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit, CUSTOM_ELEMENTS_SCHEMA, Component, OnDestroy,
  PLATFORM_ID, computed, effect, inject
} from '@angular/core';
import {
  IonBackdrop, IonBadge, IonButton, IonButtons, IonContent, IonHeader,
  IonIcon, IonInput, IonItem, IonLabel, IonMenuButton, IonNote,
  IonTitle, IonToolbar, ModalController
} from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { SpinnerComponent } from '@bk2/shared-ui';

import { FlightInfoResponse } from '@bk2/flighttracker-data-access';
import { FlightDetailModal } from './flighttracker-detail.modal';
import { FlightTrackerStore } from './flighttracker.store';

const PLANE_ICON_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36">' +
    '<path fill="%233880ff" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>' +
    '</svg>'
  );

let GoogleMap: any;
let MapType: any;

if (typeof window !== 'undefined') {
  import('@capacitor/google-maps').then((m) => {
    GoogleMap = m.GoogleMap;
    MapType = m.MapType;
  });
}

function zoomForBounds(latSpan: number, lngSpan: number): number {
  const span = Math.max(latSpan, lngSpan);
  if (span === 0) return 5;
  return Math.min(13, Math.max(2, Math.round(Math.log2(360 / span)) - 1));
}

@Component({
  selector: 'bk-flighttracker-search',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [FlightTrackerStore],
  styles: [`
    .map-container {
      width: 100%;
      height: calc(100% - 44px);
      min-height: 300px;
      position: relative;
    }
    capacitor-google-map {
      width: 100%;
      height: 100%;
      display: block;
    }
    .map-prompt {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.04);
      z-index: 10;
      pointer-events: none;
    }
  `],
  imports: [
    AsyncPipe, DecimalPipe, TranslatePipe, SvgIconPipe,
    SpinnerComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton,
    IonButton, IonIcon, IonInput, IonItem, IonLabel, IonNote,
    IonBadge, IonContent, IonBackdrop
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ '@flighttracker.title' | translate | async }}</ion-title>
      </ion-toolbar>

      <ion-toolbar>
        <ion-item lines="none">
          <ion-input
            type="text"
            [value]="flightNumber()"
            placeholder="{{ '@flighttracker.search.placeholder' | translate | async }}"
            (ionInput)="onFlightNumberInput($event)"
            (keyup.enter)="onSearch()"
          />
          <ion-input
            type="date"
            [value]="date()"
            (ionInput)="onDateInput($event)"
            style="max-width: 145px"
          />
          <ion-button slot="end" (click)="onSearch()" [disabled]="isLoading() || !flightNumber().trim()">
            {{ '@flighttracker.search.button' | translate | async }}
          </ion-button>
          <ion-button slot="end" fill="outline" (click)="onReload()" [disabled]="isLoading() || !flightData()">
            <ion-icon slot="icon-only" src="{{'refresh' | svgIcon}}" />
          </ion-button>
        </ion-item>
      </ion-toolbar>

      @if (flightData(); as fd) {
        <ion-toolbar>
          <ion-item lines="none">
            <ion-badge [color]="statusColor(fd.status)" slot="start">{{ fd.status }}</ion-badge>
            <ion-label>{{ fd.flightNumber }} &nbsp; {{ fd.departure.iata }} → {{ fd.arrival.iata }}</ion-label>
            @if (fd.live) {
              <ion-label slot="end" class="ion-hide-sm-down">
                {{ fd.live.altitude | number:'1.0-0' }} ft &nbsp;·&nbsp;
                {{ fd.live.speed_horizontal | number:'1.0-0' }} kn &nbsp;·&nbsp;
                {{ fd.live.direction }}°
              </ion-label>
            }
          </ion-item>
        </ion-toolbar>
      }
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <bk-spinner />
        <ion-backdrop />
      }
      @if (error(); as err) {
        <ion-note color="danger" style="padding: 12px; display: block;">{{ err }}</ion-note>
      }
      <div class="map-container">
        @if (!flightData() && !isLoading()) {
          <div class="map-prompt">
            <ion-note>{{ '@flighttracker.search.prompt' | translate | async }}</ion-note>
          </div>
        }
        <capacitor-google-map [id]="mapId" />
      </div>
    </ion-content>
  `
})
export class FlightTrackerSearchComponent implements AfterViewInit, OnDestroy {
  private readonly env = inject(ENV);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly modalController = inject(ModalController);

  protected readonly store = inject(FlightTrackerStore);
  protected readonly flightNumber = computed(() => this.store.flightNumber());
  protected readonly date = computed(() => this.store.date());
  protected readonly flightData = computed(() => this.store.flightData());
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly error = computed(() => this.store.error());

  protected readonly mapId = 'bk-flighttracker-map';

  private map: any;
  private markerIds: string[] = [];
  private planeMarkerId: string | null = null;
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      const data = this.store.flightData();
      if (this.map) {
        void this.onFlightDataChanged(data);
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      await this.loadMap();
    }
  }

  ngOnDestroy(): void {
    this.map?.destroy();
    this.resizeObserver?.disconnect();
  }

  protected onFlightNumberInput(event: Event): void {
    this.store.setFlightNumber((event as CustomEvent).detail.value ?? '');
  }

  protected onDateInput(event: Event): void {
    this.store.setDate((event as CustomEvent).detail.value ?? '');
  }

  protected onSearch(): void {
    void this.store.search();
  }

  protected onReload(): void {
    void this.store.reload();
  }

  protected statusColor(status: string): string {
    switch (status) {
      case 'active': return 'success';
      case 'scheduled': return 'primary';
      case 'landed': return 'medium';
      case 'cancelled': return 'danger';
      default: return 'warning';
    }
  }

  private async loadMap(): Promise<void> {
    const mapRef = document.getElementById(this.mapId);
    if (!mapRef) return;
    await this.waitForMapDimensions(mapRef);
    this.map = await GoogleMap.create({
      id: this.mapId,
      element: mapRef,
      apiKey: this.env.services.gmapKey,
      config: { center: { lat: 47.5, lng: 8.7 }, zoom: 4 },
    });
    await this.map.setMapType(MapType.Normal);
    await this.map.setOnMarkerClickListener(async (event: any) => {
      if (event.markerId === this.planeMarkerId) {
        await this.openDetailModal();
      }
    });
    const data = this.store.flightData();
    if (data) {
      await this.onFlightDataChanged(data);
    }
  }

  private async onFlightDataChanged(data: FlightInfoResponse | null): Promise<void> {
    await this.clearMarkers();
    if (!data) return;
    await this.addAirportMarker(data.departure.lat, data.departure.lng, data.departure.iata, data.departure.airport);
    await this.addAirportMarker(data.arrival.lat, data.arrival.lng, data.arrival.iata, data.arrival.airport);
    if (data.live) {
      this.planeMarkerId = await this.map.addMarker({
        coordinate: { lat: data.live.latitude, lng: data.live.longitude },
        title: data.flightNumber,
        snippet: `${data.live.altitude.toFixed(0)} ft · ${data.live.speed_horizontal.toFixed(0)} kn`,
        iconUrl: PLANE_ICON_URL,
      });
      this.markerIds.push(this.planeMarkerId!);
    }
    await this.fitCameraToMarkers(data);
  }

  private async addAirportMarker(
    lat: number | undefined,
    lng: number | undefined,
    title: string,
    snippet: string
  ): Promise<void> {
    if (lat == null || lng == null) return;
    const id = await this.map.addMarker({ coordinate: { lat, lng }, title, snippet });
    this.markerIds.push(id);
  }

  private async clearMarkers(): Promise<void> {
    for (const id of this.markerIds) {
      try { await this.map.removeMarker(id); } catch { /* ignore */ }
    }
    this.markerIds = [];
    this.planeMarkerId = null;
  }

  private async fitCameraToMarkers(data: FlightInfoResponse): Promise<void> {
    const lats: number[] = [];
    const lngs: number[] = [];
    if (data.departure.lat != null && data.departure.lng != null) {
      lats.push(data.departure.lat); lngs.push(data.departure.lng);
    }
    if (data.arrival.lat != null && data.arrival.lng != null) {
      lats.push(data.arrival.lat); lngs.push(data.arrival.lng);
    }
    if (data.live) {
      lats.push(data.live.latitude); lngs.push(data.live.longitude);
    }
    if (lats.length === 0) return;
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const zoom = zoomForBounds(maxLat - minLat, maxLng - minLng);
    await this.map.setCamera({
      coordinate: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
      zoom,
    });
  }

  private async openDetailModal(): Promise<void> {
    const data = this.store.flightData();
    if (!data) return;
    const modal = await this.modalController.create({
      component: FlightDetailModal,
      componentProps: { data },
    });
    await modal.present();
  }

  private waitForMapDimensions(mapRef: HTMLElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const maxTimeout = 2000;
      this.resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0].contentRect;
        if (rect.width > 0 && rect.height > 0) {
          this.resizeObserver?.disconnect();
          resolve();
        }
      });
      this.resizeObserver.observe(mapRef);
      setTimeout(() => {
        const rect = mapRef.getBoundingClientRect();
        this.resizeObserver?.disconnect();
        if (rect.width > 0 && rect.height > 0) resolve();
        else reject(new Error('Map element has no dimensions after 2s'));
      }, maxTimeout);
    });
  }
}
