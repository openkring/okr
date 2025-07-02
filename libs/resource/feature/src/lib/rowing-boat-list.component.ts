import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { hasRole } from '@bk2/shared/util-core';
import { error } from '@bk2/shared/util-angular';
import { TranslatePipe } from '@bk2/shared/i18n';
import { CategoryNamePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { AllCategories, ResourceModel, RoleName } from '@bk2/shared/models';
import { addAllCategory, RowingBoatTypes } from '@bk2/shared/categories';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { ResourceListStore } from './resource-list.store';

@Component({
  selector: 'bk-rowing-boat-list',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, CategoryNamePipe,
    MenuComponent, ListFilterComponent,
    SpinnerComponent, EmptyListComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList, IonPopover,
    IonIcon, IonItem, IonLabel, IonContent, IonItemSliding, IonItemOption, IonItemOptions
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
        @for(resource of filteredBoats(); track $index) {
          <ion-item-sliding #slidingItem>
            <ion-item class="ion-text-wrap" (click)="edit(undefined, resource)">
              <ion-icon slot="start" color="primary" src="{{ getIcon(resource) | svgIcon }}" />
              <ion-label>{{ resource.name }}</ion-label>
              <ion-label>{{ resource.subType | categoryName:boatTypes }}</ion-label>
              <ion-label class="ion-hide-md-down">{{ resource?.load }}</ion-label>
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
export class RowingBoatListComponent {
  protected readonly resourceListStore = inject(ResourceListStore);

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
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.resourceListStore.add(false); break;
      case 'exportRaw': await this.resourceListStore.export("raw"); break;
      default: error(undefined, `RowingBoatListComponent.call: unknown method ${_selectedMethod}`);
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

