import { isPlatformBrowser } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, input } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap, MapType } from '@capacitor/google-maps';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { SectionModel } from '@bk2/shared-models';
import { OptionalCardHeaderComponent } from '@bk2/shared-ui';
import { die } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-map-section',
  standalone: true,
  styles: [`
  ion-card-content { padding: 0px; }
  ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  capacitor-google-map {
  display: inline-block;
  width: 100%;
  height: 400px;
}
  `],
  imports: [
    IonCard, IonCardContent,
    OptionalCardHeaderComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
      <ion-card>
        <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <ion-item>
            <capacitor-google-map id="map" />
          </ion-item>
        </ion-card-content>
      </ion-card>
  `
})
export class MapSectionComponent implements OnInit, OnDestroy {
  private readonly appStore = inject(AppStore);
  private readonly platformId = inject(PLATFORM_ID);

  public section = input.required<SectionModel>();

  // tbd: lookup appStore.locationId and return its latitude, longitue and zoom level
  private readonly centerLatitude = computed(() => parseFloat(this.section()?.properties?.map?.centerLatitude ?? ''));
  private readonly centerLongitude = computed(() => parseFloat(this.section()?.properties?.map?.centerLongitude ?? ''));
  private readonly zoom = computed(() => parseFloat(this.section()?.properties?.map?.zoom ?? '15'));
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly useCurrentLocation = computed(() => this.section()?.properties?.map?.useCurrentLocationAsCenter ?? false);

  private map: GoogleMap | undefined;

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadMap();
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.destroy();
    }
  }

async loadMap() {
  const _mapRef = document.getElementById('map'); // reference to the capacitor-google-map element
  if (!_mapRef) die('MapSectionComponent.loadMap: Map element not found');
  let _centerLatitude = this.centerLatitude();
  let _centerLongitude = this.centerLongitude();
  if (this.useCurrentLocation()) {
    try {
      const _position = await Geolocation.getCurrentPosition({});
      _centerLatitude = _position.coords.latitude;
      _centerLongitude = _position.coords.longitude;
    }
    catch(error) {
      console.error('MapSectionComponent: Failed to get current position, switching back to config: ', error);
    }
  }

  this.map = await GoogleMap.create({
    id: 'bk-map',               // Unique identifier for this map instance
    element: _mapRef,
    apiKey: this.appStore.env.services.gmapKey, // Google Maps API Key
    config: {
      center: { lat: _centerLatitude, lng: _centerLongitude },
      zoom: this.zoom(), 
    }
  });
  this.map.setMapType(MapType.Satellite);
  //this.map.enableTrafficLayer(this.enableTrafficLayer);
  //await this.addMarker(this.latitude(), this.longitude());
  /* for (const _coord of this.coordinates) {
    await this.addMarker(_coord);
  } */
}

/**
 * Add a marker to the map
 * @param map 
 * @param location 
 */
public async addMarker(lat: number, lng: number): Promise<string> {
  let _markerId = '';
  if (this.map) {
    _markerId = await this.map.addMarker({
      coordinate: {
        lat: lat,
        lng: lng
      },
      title: 'Marker Title',
      snippet: 'The best place on earth!',
    });
  }
  return _markerId;
}

}