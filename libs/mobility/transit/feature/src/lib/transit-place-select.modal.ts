import { Component, Signal, computed, inject, input, signal } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, ModalController } from '@ionic/angular';

import { TransitPlace, placeFromLocation } from '@okr/mobility-transit-util';
import { LocationModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { nameMatches } from '@okr/shared-util-core';

export interface TransitPlaceSelectI18n {
  current: Signal<string>;
  favorites: Signal<string>;
  locations: Signal<string>;
}

@Component({
  selector: 'okr-transit-place-select-modal',
  standalone: true,
  imports: [Header, SvgIconPipe, IonContent, IonIcon, IonItem, IonItemDivider, IonLabel, IonList],
  styles: [`
    ion-list { padding: 0; }
    ion-item { --min-height: 48px; }
  `],
  template: `
    <okr-header
      [(searchTerm)]="searchTerm"
      [isSearchable]="true"
      [i18n]="{ title: title() }"
      [isModal]="true"
    />
    <ion-content>
      <ion-list lines="full">
        <ion-item (click)="selectCurrent()">
          <ion-icon slot="start" src="{{ 'location' | svgIcon }}" />
          <ion-label>{{ i18n().current() }}</ion-label>
        </ion-item>
        @if (filteredFavorites().length > 0) {
          <ion-item-divider>
            <ion-label>{{ i18n().favorites() }}</ion-label>
          </ion-item-divider>
          @for (place of filteredFavorites(); track $index) {
            <ion-item (click)="select(place)">
              <ion-icon slot="start" src="{{ 'star' | svgIcon }}" />
              <ion-label>{{ place.label }}</ion-label>
            </ion-item>
          }
        }
        @if (filteredLocations().length > 0) {
          <ion-item-divider>
            <ion-label>{{ i18n().locations() }}</ion-label>
          </ion-item-divider>
          @for (location of filteredLocations(); track location.okey) {
            <ion-item (click)="selectLocation(location)">
              <ion-label>{{ location.name }}</ion-label>
            </ion-item>
          }
        }
      </ion-list>
    </ion-content>
  `,
})
export class TransitPlaceSelectModal {
  private readonly modalController = inject(ModalController);

  public favorites = input<TransitPlace[]>([]);
  public locations = input<LocationModel[]>([]);
  public title = input('');
  public i18n = input.required<TransitPlaceSelectI18n>();

  protected searchTerm = signal('');
  protected filteredFavorites = computed(() => this.favorites().filter(p => nameMatches(p.label, this.searchTerm())));
  protected filteredLocations = computed(() => this.locations().filter(l => nameMatches(l.name, this.searchTerm())));

  protected selectCurrent(): Promise<boolean> {
    return this.select({ kind: 'current', label: this.i18n().current() });
  }

  protected selectLocation(location: LocationModel): Promise<boolean> {
    return this.select(placeFromLocation(location));
  }

  protected select(place: TransitPlace): Promise<boolean> {
    return dismissOverlay(this.modalController, place, 'confirm');
  }
}
