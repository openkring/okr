import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonBackdrop, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { LocationModel, RoleName } from '@bk2/shared-models';
import { CategoryNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { LocationListStore } from './location-list.store';

@Component({
  selector: 'bk-location-all-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, CategoryNamePipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent, MenuComponent, ListFilterComponent,
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
      [tags]="tags()" (tagChanged)="onTagSelected($event)"
      [type]="types()" (typeChanged)="onTypeSelected($event)"
      (searchTermChanged)="onSearchtermChange($event)"
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
            <ion-label>{{ location.type | categoryName:locationTypes }}</ion-label>
          </ion-item>
        }
      </ion-list> 
    }
  }
</ion-content>
  `
})
export class LocationListComponent {
  protected locationListStore = inject(LocationListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredLocations = computed(() => this.locationListStore.filteredLocations() ?? []);
  protected locationsCount = computed(() => this.locationListStore.locationsCount());
  protected selectedLocationsCount = computed(() => this.filteredLocations.length);
  protected isLoading = computed(() => this.locationListStore.isLoading());
  protected tags = computed(() => this.locationListStore.getTags());
  protected types = computed(() => this.locationListStore.appStore.getCategory('location_type'))
  protected popupId = computed(() => 'c_locations_' + this.listId());

  private imgixBaseUrl = this.locationListStore.appStore.env.services.imgixBaseUrl;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.locationListStore.add(); break;
      case 'exportRaw': await this.locationListStore.export("raw"); break;
      default: error(undefined, `LocationListComponent.call: unknown method ${selectedMethod}`);
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
    actionSheetOptions.buttons.push(createActionSheetButton('show', this.imgixBaseUrl, 'location'));
    actionSheetOptions.buttons.push(createActionSheetButton('copy', this.imgixBaseUrl, 'copy'));
    if (hasRole('contentAdmin', this.locationListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('show', this.imgixBaseUrl, 'location'));
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
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
      switch (data.action) {
        case 'delete':
          await this.delete(location);
          break;
        case 'edit':
          await this.edit(location);
          break;
        case 'show':
          await this.show(location);
          break;
        case 'copy':
          await this.copy(location);
          break;
      }
    }
  }

  public async edit(location?: LocationModel): Promise<void> {
    if (location) await this.locationListStore.edit(location);
  }
  
  public async delete(location?: LocationModel): Promise<void> {
    if (location) await this.locationListStore.delete(location);
  }

   public async show(location?: LocationModel): Promise<void> {
    if (location) await this.locationListStore.delete(location);
  }

   public async copy(location?: LocationModel): Promise<void> {
    if (location) await this.locationListStore.delete(location);
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.locationListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.locationListStore.setSelectedTag($event);
  }

  protected onTypeSelected(type: string): void {
    this.locationListStore.setSelectedCategory(type);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.locationListStore.currentUser());
  }
}



