import { Component, ElementRef, OnDestroy, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonAvatar, IonContent, IonIcon, IonImg, IonItem, IonLabel, IonList, IonSegment, IonSegmentButton, ModalController, ToastController } from '@ionic/angular/standalone';
import type * as L from 'leaflet';

import { EmptyList, Header, Spinner } from '@bk2/shared-ui';
import { LocationModel, LocationModelName, UserModel } from '@bk2/shared-models';
import { copyToClipboardWithConfirmation } from '@bk2/shared-util-angular';

import { AvatarPipe } from '@bk2/avatar-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { FIT_PADDING, MAX_FIT_ZOOM, LocationSelectStore } from './location-select.store';

export type LocationSelectResult =
  | { kind: 'predefined'; location: LocationModel }
  | { kind: 'custom'; label: string };

@Component({
  selector: 'bk-location-select-modal',
  standalone: true,
  imports: [
    Header, Spinner,
    AvatarPipe, EmptyList, SvgIconPipe,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList, IonIcon,
    IonSegment, IonSegmentButton,
  ],
  providers: [LocationSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { margin-top: 0px; margin-bottom: 0px; }
    ion-list { padding: 0px; }
    #location-map { width: 100%; height: 60vh; }
  `],
  template: `
    <bk-header
      [searchTerm]="searchTerm()"
      (searchTermChange)="onSearchTermChange($event)"
      [isSearchable]="true"
      [i18n]="{ title: store.i18n.location_select() }"
      [isModal]="true"
    />
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(store.showMap()) {
          <ion-segment [value]="store.viewMode()" (ionChange)="onSegmentChange($event)">
            <ion-segment-button value="list">
              <ion-label>{{ store.i18n.location_segment_list() }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="map">
              <ion-label>{{ store.i18n.location_segment_map() }}</ion-label>
            </ion-segment-button>
          </ion-segment>
        }

        @if(store.viewMode() === 'list') {
          @if(store.showCustomEntry()) {
            <ion-list lines="none">
              <ion-item class="item" color="light" (click)="selectCustom()">
                <ion-icon src="{{ 'edit' | svgIcon }}" slot="start" />
                <ion-label>
                  <h3>„{{ store.customLabel() }}"</h3>
                  <p>{{ store.i18n.location_custom_use() }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          }
          @if(selectedLocationsCount() === 0 && !store.showCustomEntry()) {
            <bk-empty-list [message]="store.i18n.location_empty()" />
          } @else {
            @for(location of filteredLocations(); track $index) {
              <ion-list lines="none">
                <ion-item class="item" (click)="select(location)">
                  <ion-avatar slot="start">
                    <ion-img src="{{ 'location.' + location.bkey | avatar:defaultIcon }}" alt="Avatar Logo" />
                  </ion-avatar>
                  <ion-label>{{location.name}}</ion-label>
                </ion-item>
              </ion-list>
            }
          }
        } @else {
          @if(store.mappableLocations().length === 0) {
            <bk-empty-list [message]="store.i18n.location_empty()" />
          }
          <div id="location-map"></div>
        }
      }
    </ion-content>
  `
})
export class LocationSelectModal implements OnDestroy {
  protected readonly store = inject(LocationSelectStore);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly el = inject(ElementRef);

  // inputs
  public type = input.required<string>();
  public currentUser = input.required<UserModel>();
  public allowCustom = input<boolean>(false);
  public showMap = input<boolean>(false);
  public mapTag = input<string | undefined>(undefined);

  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected filteredLocations = computed(() => this.store.filteredLocations() ?? []);
  protected selectedLocationsCount = computed(() => this.filteredLocations().length);
  protected isLoading = computed(() => this.store.isLoading());

  protected defaultIcon = this.store.appStore.getCategoryIcon('model_type', LocationModelName);

  // Leaflet state (lazily initialized)
  private leafletModule?: typeof import('leaflet');
  private map?: L.Map;
  private markerLayer?: L.LayerGroup;
  private refitTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => this.store.setType(this.type()));
    effect(() => this.store.setCurrentUser(this.currentUser()));
    effect(() => this.store.setAllowCustom(this.allowCustom()));
    effect(() => this.store.setShowMap(this.showMap()));
    effect(() => this.store.setMapTag(this.mapTag()));

    // Activate the Leaflet map when switching to map segment
    effect(() => {
      if (this.store.viewMode() === 'map') {
        setTimeout(() => this.activateMap(), 0);
      }
    });

    // Re-render markers on search changes (debounced), only when map is active
    effect(() => {
      void this.store.mappableLocations(); // reactive dependency
      if (this.map && this.store.viewMode() === 'map') {
        this.scheduleMarkerRerender();
      }
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.refitTimeout);
    this.map?.remove();
  }

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onSegmentChange(event: CustomEvent): void {
    this.store.setViewMode(event.detail.value as 'list' | 'map');
  }

  public select(location: LocationModel): Promise<boolean> {
    return this.modalController.dismiss(
      { kind: 'predefined', location } satisfies LocationSelectResult,
      'confirm'
    );
  }

  public selectCustom(): Promise<boolean> {
    return this.modalController.dismiss(
      { kind: 'custom', label: this.store.customLabel() } satisfies LocationSelectResult,
      'confirm'
    );
  }

  // ─── Leaflet ───────────────────────────────────────────────────────────────

  private async ensureLeaflet(): Promise<typeof import('leaflet')> {
    this.leafletModule ??= await import('leaflet');
    return this.leafletModule;
  }

  private injectPopupStyles(): void {
    if (document.getElementById('bk-location-popup-styles')) return;
    const style = document.createElement('style');
    style.id = 'bk-location-popup-styles';
    style.textContent = [
      '.location-popup { min-width: 180px; }',
      '.location-popup strong { display: block; margin-bottom: 4px; }',
      '.popup-w3w { display: flex; align-items: center; gap: 4px; font-family: monospace; font-size: 0.85em; margin-bottom: 6px; }',
      '.popup-copy-btn { background: none; border: none; cursor: pointer; font-size: 1em; padding: 2px 4px; }',
      '.popup-select-btn { width: 100%; padding: 6px; cursor: pointer; background: var(--ion-color-primary); color: #fff; border: none; border-radius: 4px; }',
      '.location-marker { background: transparent !important; border: none !important; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  private async activateMap(): Promise<void> {
    const L = await this.ensureLeaflet();
    const container = this.el.nativeElement.querySelector('#location-map') as HTMLElement | null;
    if (!container) return;

    if (!this.map) {
      this.injectPopupStyles();
      this.map = L.map(container);
      L.tileLayer(
        'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
        { maxZoom: 19, attribution: '© swisstopo' }
      ).addTo(this.map);
      this.markerLayer = L.layerGroup().addTo(this.map);
    } else {
      this.map.invalidateSize();
    }
    this.renderMarkers(L);
  }

  private renderMarkers(L: typeof import('leaflet')): void {
    if (!this.map || !this.markerLayer) return;
    this.markerLayer.clearLayers();

    const locations = this.store.mappableLocations();
    if (locations.length === 0) return;

    const latLngs: L.LatLngExpression[] = [];
    for (const location of locations) {
      const iconName = this.store.appStore.getCategoryItem('location_type', location.type)?.icon ?? 'location-outline';
      const icon = L.divIcon({
        className: 'location-marker',
        html: `<ion-icon name="${iconName}"></ion-icon>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });
      const marker = L.marker([location.latitude, location.longitude], { icon });
      marker.bindPopup(this.buildPopupEl(location));
      marker.addTo(this.markerLayer);
      latLngs.push([location.latitude, location.longitude]);
    }
    this.map.fitBounds(L.latLngBounds(latLngs), { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM });
  }

  private buildPopupEl(location: LocationModel): HTMLElement {
    const root = document.createElement('div');
    root.className = 'location-popup';

    const name = document.createElement('strong');
    name.className = 'popup-name';
    name.textContent = location.name;
    root.appendChild(name);

    if (location.what3words) {
      const w3wDiv = document.createElement('div');
      w3wDiv.className = 'popup-w3w';
      const code = document.createElement('span');
      code.className = 'popup-w3w-code';
      code.textContent = `/// ${location.what3words}`;
      const copyBtn = document.createElement('button');
      copyBtn.className = 'popup-copy-btn';
      copyBtn.setAttribute('aria-label', this.store.i18n.location_map_copy_w3w());
      copyBtn.textContent = '⧉';
      copyBtn.addEventListener('click', () => this.copyW3w(location.what3words));
      w3wDiv.append(code, copyBtn);
      root.appendChild(w3wDiv);
    }

    const selectBtn = document.createElement('button');
    selectBtn.className = 'popup-select-btn';
    selectBtn.textContent = this.store.i18n.location_map_select();
    selectBtn.addEventListener('click', () => this.select(location));
    root.appendChild(selectBtn);

    return root;
  }

  private async copyW3w(w3w: string): Promise<void> {
    await copyToClipboardWithConfirmation(
      this.toastController,
      `///${w3w}`,
      this.store.i18n.location_map_copied()
    );
  }

  private scheduleMarkerRerender(): void {
    clearTimeout(this.refitTimeout);
    this.refitTimeout = setTimeout(async () => {
      const L = await this.ensureLeaflet();
      this.renderMarkers(L);
    }, 250);
  }
}
