import { CUSTOM_ELEMENTS_SCHEMA, Component, OnDestroy, PLATFORM_ID, computed, effect, inject, input, output, signal } from '@angular/core';
import {
  IonItem, IonLabel, IonList, IonSearchbar,
  IonSegment, IonSegmentButton,
} from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { isBrowser } from '@bk2/shared-util-angular';
import { LocationModel } from '@bk2/shared-models';

let GoogleMap: any;
let MapType: any;
if (typeof window !== 'undefined') {
  import('@capacitor/google-maps').then(m => {
    GoogleMap = m.GoogleMap;
    MapType = m.MapType;
  });
}

export interface LocationSelectI18n {
  location_list_view: () => string;
  location_map_view: () => string;
  location_search: () => string;
  location_none: () => string;
}

@Component({
  selector: 'bk-location-select',
  standalone: true,
  imports: [
    IonSegment, IonSegmentButton, IonLabel,
    IonSearchbar, IonList, IonItem,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ion-segment [value]="view()" (ionChange)="onViewChange($event)">
      <ion-segment-button value="list">
        <ion-label>{{ i18n().location_list_view() }}</ion-label>
      </ion-segment-button>
      <ion-segment-button value="map">
        <ion-label>{{ i18n().location_map_view() }}</ion-label>
      </ion-segment-button>
    </ion-segment>

    @if (view() === 'list') {
      <ion-searchbar
        [value]="search()"
        (ionInput)="search.set($event.detail.value ?? '')"
        [placeholder]="i18n().location_search()"
        [debounce]="200"
      />
      <ion-list>
        @for (loc of filteredLocations(); track loc.bkey) {
          <ion-item
            button
            [color]="selectedKey() === loc.bkey ? 'primary' : ''"
            (click)="select(loc.bkey)"
          >
            <ion-label>{{ loc.name }}</ion-label>
          </ion-item>
        }
        @if (selectedKey()) {
          <ion-item button (click)="select('')">
            <ion-label color="medium">{{ i18n().location_none() }}</ion-label>
          </ion-item>
        }
      </ion-list>
    } @else {
      <capacitor-google-map id="location-select-map" style="display: block; width: 100%; height: 300px;" />
    }
  `,
})
export class LocationSelect implements OnDestroy {
  private readonly env = inject(ENV);
  private readonly platformId = inject(PLATFORM_ID);

  public readonly locations = input.required<LocationModel[]>();
  public readonly selectedKey = input<string>('');
  public readonly i18n = input.required<LocationSelectI18n>();
  public readonly locationChange = output<string>();

  protected readonly view = signal<'list' | 'map'>('list');
  protected readonly search = signal('');

  private map: any;

  constructor() {
    effect(() => {
      if (this.view() === 'map' && !this.map) {
        setTimeout(() => this.loadMap(), 50);
      }
    });
  }

  protected filteredLocations = computed(() => {
    const term = this.search().toLowerCase();
    return this.locations().filter(l => !term || l.name.toLowerCase().includes(term));
  });

  protected select(bkey: string): void {
    this.locationChange.emit(bkey);
  }

  protected onViewChange(event: CustomEvent): void {
    this.view.set(event.detail.value as 'list' | 'map');
  }

  private async loadMap(): Promise<void> {
    if (!isBrowser(this.platformId) || !GoogleMap) return;
    const mapEl = document.getElementById('location-select-map');
    if (!mapEl) return;

    this.map = await GoogleMap.create({
      id: 'location-select-map',
      element: mapEl,
      apiKey: this.env.services.gmapKey,
      config: { center: { lat: 47.5, lng: 8.5 }, zoom: 10 },
    });
    this.map.setMapType(MapType.Normal);

    for (const loc of this.locations()) {
      if (!loc.latitude && !loc.longitude) continue;
      await this.map.addMarker({
        coordinate: { lat: loc.latitude, lng: loc.longitude },
        title: loc.name,
      });
    }

    await this.map.setOnMarkerClickListener(async (marker: any) => {
      const loc = this.locations().find(l => l.name === marker.title);
      if (loc) this.select(loc.bkey);
    });
  }

  ngOnDestroy(): void {
    this.map?.destroy();
  }
}
