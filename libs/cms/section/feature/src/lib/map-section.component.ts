import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, CUSTOM_ELEMENTS_SCHEMA, Component, OnDestroy, PLATFORM_ID, computed, inject, input } from '@angular/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { Capacitor } from '@capacitor/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { LocationCollection, LocationModel, SectionModel } from '@bk2/shared-models';
import { OptionalCardHeaderComponent } from '@bk2/shared-ui';
import { die } from '@bk2/shared-util-core';
import { FirestoreService } from '@bk2/shared-data-access';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'bk-map-section',
  standalone: true,
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    .map-container {
      width: 100%;
      height: 400px;
      min-height: 400px;
      display: block;
    }
    capacitor-google-map {
      width: 100%;
      height: 100%;
      display: block;
    }
  `],
  imports: [IonCard, IonCardContent, OptionalCardHeaderComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ion-card>
      <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
      <ion-card-content>
        <div class="map-container">
          <capacitor-google-map [id]="mapId" />
        </div>
      </ion-card-content>
    </ion-card>
  `
})
export class MapSectionComponent implements AfterViewInit, OnDestroy {
  private readonly appStore = inject(AppStore);
  private readonly firestoreService = inject(FirestoreService);
  private readonly platformId = inject(PLATFORM_ID);

  public section = input.required<SectionModel>();
  //public mapId = computed(() => `map-${this.section().bkey || Math.random().toString(36).substring(2)}`); // Unique ID per instance
  protected mapId: string;

  private readonly centerLatitude = computed(() => parseFloat(this.section()?.properties?.map?.centerLatitude ?? '') || 0);
  private readonly centerLongitude = computed(() => parseFloat(this.section()?.properties?.map?.centerLongitude ?? '') || 0);
  private readonly zoom = computed(() => parseFloat(this.section()?.properties?.map?.zoom ?? '15') || 15);
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly useCurrentLocation = computed(() => this.section()?.properties?.map?.useCurrentLocationAsCenter ?? false);

  private map: GoogleMap | undefined;
  private resizeObserver: ResizeObserver | undefined;

  constructor() {
    this.mapId = `bk-map-${Math.random().toString(36).substring(2)}`; // Unique per instance
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

  async loadMap() {
    console.log('loading map with id ' + this.mapId);
    const _mapRef = document.getElementById(this.mapId);
    if (!_mapRef) die('MapSectionComponent.loadMap: Map element not found');

    // Wait for valid map dimensions with retries
    await this.waitForMapDimensions(_mapRef);

    let _centerLatitude = this.centerLatitude();
    let _centerLongitude = this.centerLongitude();
    let zoom = this.zoom();

    if (this.useCurrentLocation()) {
      try {
        const position = await this.getCurrentPosition();
        _centerLatitude = position.coords.latitude;
        _centerLongitude = position.coords.longitude;
      } catch (error: any) {
        console.error('MapSectionComponent: Failed to get current position, using default coordinates:', error.message);
        const _defaultPosition = await this.getDefaultPosition();
        _centerLatitude = _defaultPosition.coords.latitude;
        _centerLongitude = _defaultPosition.coords.longitude;
        zoom = _defaultPosition.zoom;
      }
    }

    this.map = await GoogleMap.create({
      id: this.mapId,
      element: _mapRef,
      apiKey: this.appStore.env.services.gmapKey,
      config: {
        center: { lat: _centerLatitude, lng: _centerLongitude },
        zoom
      }
    });
    await this.map.setMapType(MapType.Satellite);
  }

  /**
   * Waits for the map element to have valid dimensions using ResizeObserver.
   * @param mapRef The map element reference.
   * @throws Error if dimensions are not valid after timeout.
   */
  private async waitForMapDimensions(mapRef: HTMLElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const maxTimeout = 2000; // 2 seconds max wait
      const startTime = Date.now();

      this.resizeObserver = new ResizeObserver(entries => {
        const rect = entries[0].contentRect;
        if (rect.width > 0 && rect.height > 0) {
          this.resizeObserver?.disconnect();
          resolve();
        }
      });

      this.resizeObserver.observe(mapRef);

      // Fallback timeout
      setTimeout(() => {
        const rect = mapRef.getBoundingClientRect();
        this.resizeObserver?.disconnect();
        if (rect.width > 0 && rect.height > 0) {
          resolve();
        } else {
          reject(new Error(`MapSectionComponent.waitForMapDimensions: Failed to get valid map dimensions after ${maxTimeout}ms`));
        }
      }, maxTimeout);
    });
  }

  /**
   * This function asks the user for permission to access to current location (on iOS and Android, but not on web).
   * It then returns either the current position of the user or the default position if the user did not agree or geolocation is not supported.
   * @returns the current position of the user the default position
   */
  private async getCurrentPosition(): Promise<Position> {
    if (Capacitor.isNativePlatform()) {
      const permissionStatus = await Geolocation.requestPermissions();
      if (permissionStatus.location !== 'granted') {
        throw new Error('Location permission denied');
      }
      return await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    } else {
      if (!navigator.geolocation) {
        throw new Error('Geolocation not supported in this browser');
      }
      return await new Promise<Position>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });
    }
  }

/**
   * Retrieves the default position from the locations collection based on tenantId.
   * @returns A default position with latitude, longitude, and zoom.
   */
  private async getDefaultPosition(): Promise<{ coords: { latitude: number; longitude: number }; zoom: number }> {
    try {
      const tenantId = this.appStore.tenantId();
      const location = await firstValueFrom(this.firestoreService.readModel<LocationModel>(LocationCollection, tenantId));      
      if (location) {
        return {
          coords: { latitude: location.latitude, longitude: location.longitude },
          zoom: 15
        };
      }
    } catch (error) {
      console.error('MapSectionComponent: Failed to fetch default position:', error);
    }
    
    // Fallback to a hardcoded default if Firestore query fails
    return {
      coords: { latitude: 0, longitude: 0 },
      zoom: 15
    };
  }

  public async addMarker(lat: number, lng: number): Promise<string> {
    if (!isPlatformBrowser(this.platformId) || !this.map) {
      return '';
    }
    return await this.map.addMarker({
      coordinate: { lat, lng },
      title: 'Marker Title',
      snippet: 'The best place on earth!'
    });
  }
}