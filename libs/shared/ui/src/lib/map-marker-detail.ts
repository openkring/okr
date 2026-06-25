import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonButtons, IonIcon, IonItem, IonLabel, IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';

import { MapMarker } from './map-view.modal';

export interface MapMarkerDetailI18n {
  name: string;
  coordinates: string;
  what3words: string;
  distance: string;
}

const DEFAULT_DETAIL_I18N: MapMarkerDetailI18n = {
  name: 'Name',
  coordinates: 'Koordinaten',
  what3words: 'what3words',
  distance: 'Distanz',
};

/**
 * Read-only detail panel for a single map marker, rendered inside the MapViewModal (not a separate
 * Ionic modal) to avoid stacking conflicts with the live WebGL map. Emits `closed` when dismissed.
 */
@Component({
  selector: 'bk-map-marker-detail',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonList, IonItem, IonLabel, IonNote
  ],
  styles: [`
    :host { display: block; height: 100%; background: var(--ion-background-color, #fff); }
  `],
  template: `
    <ion-toolbar color="secondary">
      <ion-title>{{ headerTitle() }}</ion-title>
      <ion-buttons slot="end">
        <ion-button (click)="closed.emit()">
          <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
    <ion-list>
      <ion-item>
        <ion-label>{{ labels().name }}</ion-label>
        <ion-note slot="end">{{ marker().title }}</ion-note>
      </ion-item>
      <ion-item>
        <ion-label>{{ labels().coordinates }}</ion-label>
        <ion-note slot="end">{{ coordinates() }}</ion-note>
      </ion-item>
      @if (marker().what3words) {
        <ion-item>
          <ion-label>{{ labels().what3words }}</ion-label>
          <ion-note slot="end">{{ marker().what3words }}</ion-note>
        </ion-item>
      }
      @if (hasDistance()) {
        <ion-item>
          <ion-label>{{ labels().distance }}</ion-label>
          <ion-note slot="end">{{ marker().distance }} km</ion-note>
        </ion-item>
      }
    </ion-list>
  `
})
export class MapMarkerDetail {
  // inputs
  public marker = input.required<MapMarker>();
  public i18n = input<Partial<MapMarkerDetailI18n>>({});

  // outputs
  public closed = output<void>();

  protected labels = computed(() => ({ ...DEFAULT_DETAIL_I18N, ...this.i18n() }));
  protected headerTitle = computed(() => this.marker().title ?? this.labels().name);
  protected coordinates = computed(() => `${this.marker().lat.toFixed(5)}, ${this.marker().lng.toFixed(5)}`);
  protected hasDistance = computed(() => {
    const _distance = this.marker().distance;
    return _distance !== undefined && _distance !== null && _distance > 0;
  });
}
