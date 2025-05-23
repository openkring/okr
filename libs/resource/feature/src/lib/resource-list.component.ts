import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { error, TranslatePipe } from '@bk2/shared/i18n';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { RoleName } from '@bk2/shared/config';
import { AllCategories, ModelType, ResourceModel, ResourceType } from '@bk2/shared/models';
import { addAllCategory, ResourceTypes, RowingBoatTypes } from '@bk2/shared/categories';
import { hasRole } from '@bk2/shared/util';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { ResourceListStore } from './resource-list.store';


@Component({
  selector: 'bk-resource-list',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MenuComponent, ListFilterComponent,
    SpinnerComponent, EmptyListComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList,
    IonIcon, IonItem, IonLabel, IonContent, IonItemSliding, 
    IonItemOptions, IonItemOption, IonPopover
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
        <ion-item-sliding #slidingItem>
          <ion-item class="ion-text-wrap" (click)="edit(undefined, resource)">
            <ion-icon slot="start" src="{{ getIcon(resource) | svgIcon }}" />
            <ion-label>{{ resource?.name }}</ion-label>
            <ion-label>{{ resource?.currentValue }}</ion-label>
            <ion-label>{{ resource?.description }}</ion-label>
          </ion-item>
          @if(hasRole('resourceAdmin')) {
            <ion-item-options side="end">
              <ion-item-option color="primary" (click)="edit(slidingItem, resource)">
                <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
              </ion-item-option>
              <ion-item-option color="danger" (click)="delete(slidingItem, resource)">
                <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
              </ion-item-option>
            </ion-item-options>
          }
        </ion-item-sliding>    
      }
    </ion-list>
  }
}
</ion-content>
  `
})
export class ResourceListComponent {
  protected readonly resourceListStore = inject(ResourceListStore);

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
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.resourceListStore.add(true); break;
      case 'exportRaw': await this.resourceListStore.export("raw"); break;
      default: error(undefined, `ResourceListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async edit(slidingItem?: IonItemSliding, resource?: ResourceModel, isTypeEditable = false): Promise<void> {
    if (slidingItem) slidingItem.close();
    resource ??= new ResourceModel(this.resourceListStore.tenantId());
    await this.resourceListStore.edit(resource, isTypeEditable);
  }

  public async delete(slidingItem?: IonItemSliding, resource?: ResourceModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (resource) await this.resourceListStore.delete(resource);
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.resourceListStore.currentUser());
  }
}

