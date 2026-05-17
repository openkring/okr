import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonBackdrop, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { LocationModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';

import { LocationListStore } from './location-list.store';

@Component({
  selector: 'bk-location-all-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    Spinner, EmptyList, Menu, ListFilter,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem, IonBackdrop,
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
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
    />

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
          <ion-item (click)="showActions(location)">
            <ion-label>{{ location.name }}</ion-label>
            <ion-label>{{ location.type }}</ion-label>
          </ion-item>
        }
      </ion-list> 
    }
  }
</ion-content>
  `
})
export class LocationList {
  protected store = inject(LocationListStore);
  private actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedType());

  // fields
  protected filteredLocations = computed(() => this.store.filteredLocations() ?? []);
  protected locationsCount = computed(() => this.store.locationsCount());
  protected selectedLocationsCount = computed(() => this.filteredLocations().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.appStore.getCategory('location_type'))
  protected popupId = computed(() => 'c_locations_' + this.listId());
  protected currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedType(type);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(this.readOnly()); break;
      case 'showOnMap': await this.store.showOnMap(); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: this.alertService.error(`LocationListComponent.call: unknown method ${selectedMethod}`);
    }
  }

 /**
   * Displays an ActionSheet with all possible actions on a Location. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param location 
   */
  protected async showActions(location: LocationModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, location);
    await this.executeActions(actionSheetOptions, location);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param location 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, location: LocationModel): void {
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('location.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('location.convert', this.imgixBaseUrl, 'edit'));
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton('location.view', this.imgixBaseUrl, 'eye-on'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('location.delete', this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('location.showOnMap', this.imgixBaseUrl, 'location'));
    actionSheetOptions.buttons.push(createActionSheetButton('location.copy', this.imgixBaseUrl, 'copy'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param location 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, location: LocationModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'location.delete':
          await this.store.delete(location, this.readOnly());
          break;
        case 'location.edit':
          await this.store.edit(location, this.readOnly());
          break;
        case 'location.view':
          await this.store.edit(location, true);
          break;
        case 'location.showOnMap':
          await this.store.showOnMap(location);
          break;
        case 'location.convert': 
          await this.store.convert(location);
          break;
        case 'location.copy':
          await this.store.copy(location);
          break;
      }
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}



