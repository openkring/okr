import { Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonIcon, IonItem, IonLabel, IonList, IonPopover, IonRow, IonSearchbar, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { City } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { CitySearchStore } from './city-search.store';

@Component({
  selector: 'okr-city-search',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonRow, IonCol, IonSearchbar, IonPopover, IonList, IonItem, IonLabel,
    IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonSpinner,
  ],
  providers: [CitySearchStore],
  template: `
    @if (hasDataset()) {
      <ion-row>
        <ion-col size="12">
          <ion-searchbar #okrSearchCity (ionInput)="onSearchtermChange($event)"
              type="search" inputmode="search"
              [debounce]="debounce()" [placeholder]="placeholder()">
          </ion-searchbar>
          @if (store.loading()) { <ion-spinner name="dots" /> }
          <ion-popover [isOpen]="isPopoverOpen()" [showBackdrop]="true" [dismissOnSelect]="true" (didDismiss)="isPopoverOpen.set(false)">
            <ng-template>
              <ion-toolbar color="primary">
                <ion-title>Ort suchen</ion-title>
                <ion-buttons slot="end">
                  <ion-button (click)="isPopoverOpen.set(false)">
                    <ion-icon slot="icon-only" src="{{'cancel' | svgIcon }}" />
                  </ion-button>
                </ion-buttons>
              </ion-toolbar>
              <ion-list>
                @for (city of store.filteredCities(); track $index) {
                  <ion-item (click)="citySelected.emit(city)" button="true" detail="false">
                    <ion-label>{{ city.zipCode }} {{ city.name }}</ion-label>
                  </ion-item>
                } @empty {
                  <ion-item><ion-label>Keine Übereinstimmungen gefunden.</ion-label></ion-item>
                }
              </ion-list>
            </ng-template>
          </ion-popover>
        </ion-col>
      </ion-row>
    }
  `,
})
export class CitySearch {
  protected store = inject(CitySearchStore);
  public countryCode = input('');
  public placeholder = input('Stadt oder PLZ suchen');
  public debounce = input(500);

  public citySelected = output<City>();
  protected isPopoverOpen = signal(false);
  protected hasDataset = computed(() => this.store.cities().length > 0 || this.store.loading());
  protected okrSearchCity = viewChild<IonSearchbar>('okrSearchCity');

  constructor() {
    effect(() => { this.store.setCountry(this.countryCode()); });
  }

  protected onSearchtermChange($event: Event): void {
    this.store.setSearchTerm(($event.target as HTMLInputElement).value);
    const matches = this.store.filteredCities();
    if (matches.length === 1) this.citySelected.emit(matches[0]);
    else if (matches.length > 1) this.isPopoverOpen.set(true);
  }
}
