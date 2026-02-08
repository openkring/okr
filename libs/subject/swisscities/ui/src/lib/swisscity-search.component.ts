import { Component, computed, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonIcon, IonItem, IonLabel, IonList, IonPopover, IonRow, IonSearchbar, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SwissCity } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { SwissCitiesSearchStore } from './swisscity-search.store';

@Component({
  selector: 'bk-swisscity-search',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonRow, IonCol, IonSearchbar, IonPopover, IonList, IonItem, IonLabel, 
    IonToolbar, IonTitle, IonButtons, IonButton, IonIcon
  ],
  providers: [SwissCitiesSearchStore],
  template: `
    <ion-row>
      <ion-col size="12">
      <ion-searchbar  #bkSearchCity (ionInput)="onSearchtermChange($event)"
          type="search" 
          inputmode="search"
          [debounce]="debounce()"
          [placeholder]="placeholder()"
          [value]="searchTerm()">
      </ion-searchbar>
      <ion-popover [isOpen]="isPopoverOpen()" [showBackdrop]="true" [dismissOnSelect]="true" (didDismiss)="isPopoverOpen.set(false)">
        <ng-template>
          <ion-toolbar color="primary">
            <ion-title>Ort suchen</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="isPopoverOpen.set(false)">
                <ion-icon slot="icon-only" src="{{'close_cancel_circle' | svgIcon }}" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
          <ion-list>
            @for (city of swissCitiesSearchStore.filteredCities(); track $index) {
              <ion-item (click)="citySelected.emit(city)" button="true" detail="false">
                <ion-label>{{ city.zipCode }} {{ city.name }}</ion-label>
              </ion-item>
            } @empty {
              <ion-item>
                <ion-label>Keine Übereinstimmungen gefunden.</ion-label>
              </ion-item>
            }
          </ion-list>
        </ng-template>
      </ion-popover>
      </ion-col>
    </ion-row>
  `
})
export class SwissCitySearchComponent implements OnInit {
  protected swissCitiesSearchStore = inject(SwissCitiesSearchStore);
  public searchTerm = input('');
  public placeholder = input('Stadt oder PLZ suchen');
  public debounce = input(500);
  public setFocus = input(true);

  public citySelected = output<SwissCity>();
  protected isPopoverOpen = signal(false);

  protected bkSearchCity = viewChild<IonSearchbar>('bkSearchCity');
  // fires ionInput event for every change of the value
  // fires ionChange event when the value has been committed by the user, i.e. element loses focus or the 'enter' key is pressed.

  private readonly filteredCitiesCount = computed(() => this.swissCitiesSearchStore.filteredCities().length);
  /**
   * sets focus into the search input field
   * see https://stackoverflow.com/questions/45786205/how-to-focus-ion-searchbar-on-button-click#45786266
   */
  ngOnInit() {
    if (this.setFocus()) {
      setTimeout(() => {
        if (this.bkSearchCity()) this.bkSearchCity()?.setFocus();
      }, 500);
    }
  }

  protected onSearchtermChange($event: Event): void {
    this.swissCitiesSearchStore.setSearchTerm(($event.target as HTMLInputElement).value);
    if (this.filteredCitiesCount() === 1) {
      this.citySelected.emit(this.swissCitiesSearchStore.filteredCities()[0]);
    }
    if (this.filteredCitiesCount() > 1) {
      this.isPopoverOpen.set(true);
    } 
  }
}