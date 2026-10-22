import { Component, computed, input, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';

import { Header } from './header';
import { LeafletMap, MapMarker } from './leaflet-map';
import { MapMarkerDetail, MapMarkerDetailI18n } from './map-marker-detail';

@Component({
  selector: 'okr-map-view-modal',
  standalone: true,
  styles: [`
    .map-wrap { position: relative; width: 100%; height: 100%; }
    okr-map-marker-detail { position: absolute; inset: 0; z-index: 1000; }
  `],
  imports: [
    Header, LeafletMap, MapMarkerDetail,
    IonContent
  ],
  template: `
      <okr-header [i18n]="{ title: title() }" [isModal]="true" />
      <ion-content [scrollY]="false">
        <div class="map-wrap">
          <okr-leaflet-map [markers]="allMarkers()" [zoom]="zoom()" [fallbackLabel]="title()" (markerClick)="openDetail($event)" />
          @if (selectedMarker(); as marker) {
            <okr-map-marker-detail [marker]="marker" [i18n]="detailLabels()" (closed)="closeDetail()" />
          }
        </div>
      </ion-content>
  `
})
export class MapViewModal {
  // inputs
  public center = input.required<MapMarker>(); // camera centre and first marker
  public markers = input<MapMarker[]>([]); // additional markers
  public title = input.required<string>(); // modal header title
  public detailLabels = input<Partial<MapMarkerDetailI18n>>({}); // optional label overrides for the pin-detail panel
  public zoom = input(15); // initial zoom when a single marker is shown

  protected allMarkers = computed(() => [this.center(), ...this.markers()]);

  // The marker whose detail panel is currently shown (null = map view). Rendered as an in-modal
  // overlay; Leaflet is plain DOM so it neither occludes nor swallows the panel's clicks.
  protected selectedMarker = signal<MapMarker | null>(null);

  protected openDetail(marker: MapMarker): void {
    this.selectedMarker.set(marker);
  }

  protected closeDetail(): void {
    this.selectedMarker.set(null);
  }
}
