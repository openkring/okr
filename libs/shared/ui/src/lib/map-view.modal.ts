import { isPlatformBrowser } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnDestroy, OnInit, inject, input, PLATFORM_ID, computed } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { coerceBoolean, die } from '@bk2/shared-util-core';

import { HeaderComponent } from './header.component';

// Dynamic import for Capacitor Google Maps to avoid SSR issues
let GoogleMap: any;
let MapType: any;

if (typeof window !== 'undefined') {
  import('@capacitor/google-maps').then(module => {
    GoogleMap = module.GoogleMap;
    MapType = module.MapType;
  });
}

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

@Component({
  selector: 'bk-map-view-modal',
  standalone: true,
  styles: [`
  capacitor-google-map {
  display: inline-block;
  width: 100%;
  height: 100%;
}
  `],
  imports: [
    HeaderComponent,
    IonContent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
      <bk-header [title]="title()" [isModal]="true" />
      <ion-content>
        <capacitor-google-map id="map" />
      </ion-content>
  `
})
export class MapViewModalComponent implements OnInit, OnDestroy {
  private readonly env = inject(ENV);
  private readonly platformId = inject(PLATFORM_ID);

  // inputs
  public initialPosition = input.required<GeoCoordinates>();
  public coordinates = input<GeoCoordinates[]>([]);
  public title = input('@menu.main.info.map');
  public zoom = input(15); // The initial zoom level to be rendered by the map
  public enableTrafficLayer = input(false);

  // coerced boolean inputs
  protected shouldEnableTrafficLayer = computed(() => coerceBoolean(this.enableTrafficLayer()));

  private map: any; // GoogleMap instance - using any to avoid type issues with dynamic imports
  
  ngOnInit(): void {
      this.loadMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.destroy();
    }
  }

  async loadMap() {
    if (!isPlatformBrowser(this.platformId)) {
      console.warn('MapSectionComponent.loadMap: Not in browser, skipping map load');
      return;
    }
    
    const _mapRef = document.getElementById('map'); // reference to the capacitor-google-map element
    if (!_mapRef) die('MapViewModal.loadMap: Map element not found');
    this.map = await GoogleMap.create({
      id: 'bk-map',               // Unique identifier for this map instance
      element: _mapRef, 
      apiKey: this.env.services.gmapKey, // Google Maps API Key
      config: {
        center: this.initialPosition(),
        zoom: this.zoom(), 
      }
    });
    this.map.setMapType(MapType.Satellite);
    this.map.enableTrafficLayer(this.shouldEnableTrafficLayer());
    await this.addMarker(this.initialPosition());
    for (const _coord of this.coordinates()) {
      await this.addMarker(_coord);
    }
  }

  /**
   * Add a marker to the map
   * @param map 
   * @param location 
   */
  public async addMarker(coords: GeoCoordinates): Promise<string> {
    let _markerId = '';
    if (this.map) {
      _markerId = await this.map.addMarker({
        coordinate: {
          lat: coords.lat,
          lng: coords.lng
        },
        title: this.title(),
        snippet: 'The best place on earth!',
      });
    }
    return _markerId;
  }
}