import { Component, computed, inject, input } from '@angular/core';
import { IonBackdrop, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { error, TranslatePipe } from '@bk2/shared/i18n';
import { CategoryNamePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { addAllCategory, LocationTypes } from '@bk2/shared/categories';
import { AllCategories, LocationModel } from '@bk2/shared/models';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { LocationListStore } from './location-list.store';

@Component({
  selector: 'bk-location-all-list',
  imports: [
    TranslatePipe, AsyncPipe, CategoryNamePipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent, MenuComponent, ListFilterComponent,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem, IonBackdrop,
    IonItemSliding, IonItemOptions, IonItemOption,
    IonGrid, IonRow, IonCol, IonList, IonPopover
  ],
  providers: [LocationListStore],
  template: `
  <ion-header>
      <!-- title and context menu -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedLocationsCount()}}/{{locationsCount()}} {{ '@location.plural' | translate | async }}</ion-title>
      @if(hasRole('privileged') || hasRole('admin')) {
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
            <ng-template>
              <ion-content>
                <bk-menu [menuName]="contextMenuName()"/>
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>          
      }
    </ion-toolbar>

    <!-- description -->
    <ion-toolbar class="ion-hide-md-down">
      <ion-item lines="none">
        <ion-label>{{ '@location.description' | translate | async }}</ion-label>
      </ion-item>
    </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter 
      [tags]="locationTags()"
      [types]="locationTypes"
      typeName="locationType"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item color="primary" lines="none">
        <ion-grid>
          <ion-row>
            <ion-col size="8">
              <ion-label><strong>{{ '@location.list.header.name' | translate | async }}</strong></ion-label>  
            </ion-col>
            <ion-col size="4">
                <ion-label><strong>{{ '@location.list.header.locationType' | translate | async }}</strong></ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- Data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
    <ion-backdrop />
  } @else {
    @if (selectedLocationsCount() === 0) {
      <bk-empty-list message="@location.field.empty" />
    } @else {
      <ion-list lines="inset">
        @for(location of filteredLocations(); track location.bkey) {
          <ion-item-sliding #slidingItem>
            <ion-item (click)="edit(slidingItem, location)">
              <ion-label>{{ location.name }}</ion-label>
              <ion-label>{{ location.type | categoryName:locationTypes }}</ion-label>
            </ion-item>
            <ion-item-options side="end">
              <ion-item-option color="danger" (click)="delete(slidingItem, location)">
                <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
              </ion-item-option>
              <ion-item-option color="primary" (click)="edit(slidingItem, location)">
                <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
              </ion-item-option>
            </ion-item-options>
          </ion-item-sliding>
        }
      </ion-list> 
    }
  }
</ion-content>
  `
})
export class LocationListComponent {
  protected locationListStore = inject(LocationListStore);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredLocations = computed(() => this.locationListStore.filteredLocations() ?? []);
  protected locationsCount = computed(() => this.locationListStore.locationsCount());
  protected selectedLocationsCount = computed(() => this.filteredLocations.length);
  protected isLoading = computed(() => this.locationListStore.isLoading());
  protected locationTags = computed(() => this.locationListStore.getTags());
  protected popupId = computed(() => 'c_locations_' + this.listId());

  protected locationTypes = addAllCategory(LocationTypes);
  protected selectedCategory = AllCategories;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.locationListStore.add(); break;
      case 'exportRaw': await this.locationListStore.export("raw"); break;
      default: error(undefined, `LocationListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async edit(slidingItem?: IonItemSliding, location?: LocationModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (location) await this.locationListStore.edit(location);
  }
  
  public async delete(slidingItem?: IonItemSliding, location?: LocationModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (location) await this.locationListStore.delete(location);
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.locationListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.locationListStore.setSelectedTag($event);
  }

  protected onCategoryChange($event: number): void {
    this.locationListStore.setSelectedCategory($event);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.locationListStore.currentUser());
  }
}



