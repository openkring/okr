import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { addAllCategory, ResourceTypes, RowingBoatTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AllCategories, ModelType, ResourceModel, ResourceType, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { ResourceListStore } from './resource-list.store';


@Component({
  selector: 'bk-resource-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MenuComponent, ListFilterComponent,
    SpinnerComponent, EmptyListComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList,
    IonIcon, IonItem, IonLabel, IonContent, IonPopover
  ],
  providers: [ResourceListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedResourcesCount()}}/{{resourcesCount() }} {{ title | translate | async}}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c_resource">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c_resource" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      [tags]="resourceTags()"
      [types]="types"
      typeName="resourceType"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeSelected($event)"
     />

  <!-- list header -->
  <ion-toolbar color="primary">
    <ion-item color="primary" lines="none">
      <ion-label><strong>{{ '@input.name.label' | translate | async }}</strong></ion-label>
      <ion-label><strong>{{ '@input.value.label' | translate | async }}</strong></ion-label>
      <ion-label class="ion-hide-md-down"><strong>{{ '@general.util.description' | translate | async }}</strong></ion-label>
    </ion-item>
  </ion-toolbar>
</ion-header>

<!-- list data -->
<ion-content #content>
@if(isLoading()) {
  <bk-spinner />
} @else {
  @if(selectedResourcesCount() === 0) {
    <bk-empty-list message="@resource.field.empty" />
  } @else {
    <ion-list lines="inset">
      @for(resource of filteredResources(); track $index) {
        <ion-item class="ion-text-wrap" (click)="showActions(resource)">
          <ion-icon slot="start" src="{{ getIcon(resource) | svgIcon }}" />
          <ion-label>{{ resource?.name }}</ion-label>
          <ion-label>{{ resource?.currentValue }}</ion-label>
          <ion-label>{{ resource?.description }}</ion-label>
        </ion-item>
      }
    </ion-list>
  }
}
</ion-content>
  `
})
export class ResourceListComponent {
  protected readonly resourceListStore = inject(ResourceListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public filter = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredResources = computed(() => this.resourceListStore.filteredResources() ?? []);
  protected resourcesCount = computed(() => this.resourceListStore.resourcesCount());
  protected selectedResourcesCount = computed(() => this.filteredResources().length);
  protected isLoading = computed(() => this.resourceListStore.isLoading());
  protected readonly resourceTags = computed(() => this.resourceListStore.getResourceTags());
  protected title = '@resource.plural'
  
  protected boatTypes = RowingBoatTypes;
  protected selectedCategory = AllCategories;
  protected types = addAllCategory(ResourceTypes);
  protected modelType = ModelType;
  protected resourceTypes = ResourceTypes;
  private imgixBaseUrl = this.resourceListStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.resourceListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.resourceListStore.setSelectedTag($event);
  }

  protected onTypeSelected($event: number): void {
    this.resourceListStore.setSelectedResourceType($event);
  }

  /******************************** getters ******************************************* */
  protected getIcon(resource: ResourceModel): string {
    if (resource.type === ResourceType.RowingBoat) 
      return this.boatTypes[resource.subType].icon;
    else
    return this.resourceTypes[resource.type].icon;
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.resourceListStore.add(true); break;
      case 'exportRaw': await this.resourceListStore.export("raw"); break;
      default: error(undefined, `ResourceListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a resource. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param resource 
   */
  protected async showActions(resource: ResourceModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, resource);
    await this.executeActions(actionSheetOptions, resource);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param resource 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, resource: ResourceModel): void {
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
   * @param resource 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, resource: ResourceModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'delete':
          await this.resourceListStore.delete(resource);
          break;
        case 'edit':
          await this.resourceListStore.edit(resource);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.resourceListStore.currentUser());
  }
}

