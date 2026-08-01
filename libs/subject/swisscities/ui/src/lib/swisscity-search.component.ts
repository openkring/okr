import { Component, computed, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonIcon, IonItem, IonLabel, IonList, IonPopover, IonRow, IonSearchbar, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SwissCity } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';

import { SWISSCITIES_I18N_KEYS, SwissCitiesI18n } from './swisscities-i18n';
import { SwissCitiesSearchStore } from './swisscity-search.store';

@Component({
  selector: 'okr-swisscity-search',
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
      <ion-searchbar  #okrSearchCity (ionInput)="onSearchtermChange($event)"
          type="search" 
          inputmode="search"
          [debounce]="debounce()"
          [placeholder]="effectivePlaceholder()"
          [value]="searchTerm()">
      </ion-searchbar>
      <ion-popover [isOpen]="isPopoverOpen()" [showBackdrop]="true" [dismissOnSelect]="true" (didDismiss)="isPopoverOpen.set(false)">
        <ng-template>
          <ion-toolbar color="primary">
            <ion-title>{{ i18n.search_title() }}</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="isPopoverOpen.set(false)">
                <ion-icon slot="icon-only" src="{{'cancel' | svgIcon }}" />
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
                <ion-label>{{ i18n.empty() }}</ion-label>
              </ion-item>
            }
          </ion-list>
        </ng-template>
      </ion-popover>
      </ion-col>
    </ion-row>
  `
})
export class SwissCitySearch implements OnInit {
  protected swissCitiesSearchStore = inject(SwissCitiesSearchStore);
  protected readonly i18n = inject(I18nService).translateAll(SWISSCITIES_I18N_KEYS) as SwissCitiesI18n;

  public searchTerm = input('');
  /** empty → the translated default placeholder is used */
  public placeholder = input('');
  public debounce = input(500);
  public setFocus = input(true);

  public citySelected = output<SwissCity>();
  protected isPopoverOpen = signal(false);
  protected readonly effectivePlaceholder = computed(() => this.placeholder() || this.i18n.search_placeholder());

  protected okrSearchCity = viewChild<IonSearchbar>('okrSearchCity');
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
        if (this.okrSearchCity()) this.okrSearchCity()?.setFocus();
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