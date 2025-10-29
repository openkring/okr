import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { addAllCategory, RowingBoatTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AllCategories, ResourceModel, RoleName } from '@bk2/shared-models';
import { CategoryNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { ResourceListStore } from './resource-list.store';

@Component({
  selector: 'bk-rowing-boat-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, CategoryNamePipe,
    MenuComponent, ListFilterComponent,
    SpinnerComponent, EmptyListComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList, IonPopover, IonIcon, IonItem, IonLabel, IonContent
  ],
  providers: [ResourceListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedBoatsCount()}}/{{boatsCount() }} {{ title | translate | async}}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c_rboat">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c_rboat" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
            <ng-template>
              <ion-content>
                <bk-menu [menuName]="contextMenuName()"/>
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>       
      }
    </ion-toolbar>

     <!-- search and filters -->
     <bk-list-filter 
      [tags]="boatTags()"
      [types]="allBoatTypes"
      typeName="rowingBoatType"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeSelected($event)"
     />

    <!-- list header -->
  <ion-toolbar color="primary">
    <ion-item color="primary" lines="none">
      <ion-label><strong>{{ '@input.boatName.label' | translate | async }}</strong></ion-label>
      <ion-label><strong>{{ '@input.boatType.label' | translate | async }}</strong></ion-label>
      <ion-label class="ion-hide-md-down"><strong>{{ '@input.load.label' | translate | async }}</strong></ion-label>
    </ion-item>
  </ion-toolbar>
</ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if(selectedBoatsCount() === 0) {
      <bk-empty-list message="@resource.boat.field.empty" />
    } @else {
      <ion-list lines="inset">
        @for(boat of filteredBoats(); track $index) {
          <ion-item class="ion-text-wrap" (click)="showActions(boat)">
            <ion-icon slot="start" color="primary" src="{{ getIcon(boat) | svgIcon }}" />
            <ion-label>{{ boat.name }}</ion-label>
            <ion-label>{{ boat.subType | categoryName:boatTypes }}</ion-label>
            <ion-label class="ion-hide-md-down">{{ boat?.load }}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  }
</ion-content>
  `
})
export class RowingBoatListComponent {
  protected readonly resourceListStore = inject(ResourceListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public filter = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredBoats = computed(() => this.resourceListStore.filteredBoats() ?? []);
  protected boatsCount = computed(() => this.resourceListStore.boatsCount());
  protected selectedBoatsCount = computed(() => this.filteredBoats().length);
  protected isLoading = computed(() => this.resourceListStore.isLoading());
  protected boatTags = computed(() => this.resourceListStore.getRowingBoatTags());
  protected title = '@resource.boat.plural'
  
  protected boatTypes = RowingBoatTypes;
  protected allBoatTypes = addAllCategory(RowingBoatTypes);
  protected selectedCategory = AllCategories;
  protected categories = addAllCategory(RowingBoatTypes);
  private imgixBaseUrl = this.resourceListStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.resourceListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.resourceListStore.setSelectedTag($event);
  }

  protected onTypeSelected($event: number): void {
    this.resourceListStore.setSelectedBoatType($event);
  }

  /******************************** getters ******************************************* */
  protected getIcon(resource: ResourceModel): string {
    return this.boatTypes[resource.subType].icon;
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.resourceListStore.add(false); break;
      case 'exportRaw': await this.resourceListStore.export("raw"); break;
      default: error(undefined, `RowingBoatListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a rowing boat. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param boat 
   */
  protected async showActions(boat: ResourceModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, boat);
    await this.executeActions(actionSheetOptions, boat);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param boat 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, boat: ResourceModel): void {
    if (hasRole('resourceAdmin', this.resourceListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (hasRole('admin', this.resourceListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param boat 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, boat: ResourceModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'delete':
          await this.resourceListStore.delete(boat);
          break;
        case 'edit':
          await this.resourceListStore.edit(boat);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.resourceListStore.currentUser());
  }
}

