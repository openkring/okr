import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, CUSTOM_ELEMENTS_SCHEMA, Component, OnDestroy, PLATFORM_ID, computed, inject, input } from '@angular/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { Capacitor } from '@capacitor/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { LocationCollection, LocationModel, SectionModel } from '@bk2/shared-models';
import { OptionalCardHeaderComponent } from '@bk2/shared-ui';
import { debugMessage, die } from '@bk2/shared-util-core';
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
  imports: [
    IonCard, IonCardContent, OptionalCardHeaderComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ion-card>
      <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
      <ion-card-content>
        @if(locationError) {
          <div class="error-message">
            {{ locationError }}
          </div>
        }
        @if(useCurrentLocation()) {
          <ion-button (click)="triggerGeolocation()">Use My Location</ion-button>
        }
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
  
  protected mapId: string;
  protected locationError: string | null = null;

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
      await this.checkGeolocationStatus();
    }
  }

  ngOnDestroy(): void {
    this.map?.destroy();
    this.resizeObserver?.disconnect();
  }

  private async checkGeolocationStatus(): Promise<void> {
    if (!navigator.geolocation) {
      debugMessage('MapSectionComponent.checkGeolocationStatus: geolocation is not supported');
      return;
    }
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      debugMessage(`MapSectionComponent.checkGeolocationStatus: geolocation permission status:${status.state}`);
    } catch (error) {
      console.log('Permission query failed:', error);
    }
  }

  public async triggerGeolocation(): Promise<void> {
    this.locationError = null;
    try {
      const position = await this.getCurrentPosition();
      await this.updateMapCenter(position.coords.latitude, position.coords.longitude);
    } catch (error: any) {
      this.locationError = 'Location access denied. Please enable in Safari Settings > Privacy > Location Services.';
      console.error('MapSectionComponent: Failed to get current position:', error.message);
      const defaultPosition = await this.getDefaultPosition();
      await this.updateMapCenter(defaultPosition.coords.latitude, defaultPosition.coords.longitude, defaultPosition.zoom);
    }
  }

  private async updateMapCenter(lat: number, lng: number, zoom: number = this.zoom()): Promise<void> {
    if (!this.map) return;
    await this.map.setCamera({
      coordinate: { lat, lng },
      zoom
    });
  }

  /**
   * Load a map into the view.
   */
  private async loadMap(): Promise<void> {
    console.log('MapSectionComponent.loadMap: loading map with id ' + this.mapId);
    const mapRef = document.getElementById(this.mapId);
    if (!mapRef) die('MapSectionComponent.loadMap: Map element not found');

    // Wait for valid map dimensions with retries
    await this.waitForMapDimensions(mapRef);

    let centerLatitude = this.centerLatitude();
    let centerLongitude = this.centerLongitude();
    let zoom = this.zoom();

    if (this.useCurrentLocation()) {
      const defaultPosition = await this.getDefaultPosition();
      centerLatitude = defaultPosition.coords.latitude;
      centerLongitude = defaultPosition.coords.longitude;
      zoom = defaultPosition.zoom;
    }

    try {
      this.map = await GoogleMap.create({
        id: this.mapId,
        element: mapRef,
        apiKey: this.appStore.env.services.gmapKey,
        config: {
          center: { lat: centerLatitude, lng: centerLongitude },
          zoom
        }
      });
      debugMessage(`MapSectionComponent.loadMap: map ${this.mapId} initialized successfully.`);
      await this.map.setMapType(MapType.Satellite);
    } catch (error: any) {
      console.error(`MapSectionComponent.loadMap: failed to initialize map ${this.mapId}`, error);
      throw error;
    }
  }

  /**
   * Waits for the map element to have valid dimensions using ResizeObserver.
   * @param mapRef The map element reference.
   * @throws Error if dimensions are not valid after timeout.
   */
  private async waitForMapDimensions(mapRef: HTMLElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const maxTimeout = 2000; // 2 seconds max wait

      this.resizeObserver = new ResizeObserver(entries => {
        const rect = entries[0].contentRect;
        debugMessage(`MapSectionComponent.waitForMapDimensions: Dimensions - width: ${rect.width}, height: ${rect.height}`);
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
        debugMessage(`MapSectionComponent.waitForMapDimensions: Timeout check - width: ${rect.width}, height: ${rect.height}`);
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
      // Check permission status before requesting
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        if (permissionStatus.state === 'denied') {
          throw new Error('User denied Geolocation');
        }
        debugMessage('MapSectionComponent.getCurrentPosition: geolocation accepted.');
      } catch (error) {
        console.warn('MapSectionComponent: Permission query not supported or failed:', error);
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