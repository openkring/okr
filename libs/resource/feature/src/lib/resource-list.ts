import { Component, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular';
import { ResourceModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { error } from '@okr/shared-util-angular';
import { hasRole, contextMenuId } from '@okr/shared-util-core';

import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';

import { OwnershipStore } from '@okr/relationship-ownership-feature';

import { RESOURCE_EDIT_MODAL_PROVIDER } from './resource-edit-modal.provider';
import { ResourceStore } from './resource.store';

type ResourceSortField = 'name' | 'value';

@Component({
  selector: 'okr-resource-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Menu, ListFilter, Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList,
    IonIcon, IonItem, IonLabel, IonContent, IonPopover
  ],
  providers: [ResourceStore, OwnershipStore, RESOURCE_EDIT_MODAL_PROVIDER],
  styles: [`.clickable { cursor: pointer; user-select: none; }`],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title class="ion-hide-sm-down">{{selectedResourcesCount()}}/{{resourcesCount() }} {{ store.i18n.resources() }}</ion-title>
      <ion-title class="ion-hide-sm-up">{{selectedResourcesCount()}} {{ store.i18n.resources() }}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
          @if (menuItemsStore.canOpen(contextMenuName())) {
            <ion-button id="{{ popupId }}">
              <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </ion-buttons>       
      }
    </ion-toolbar>

    <!-- search and filters -->
    <okr-list-filter class="ion-hide-sm-down"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
     />
    <okr-list-filter class="ion-hide-sm-up"
      (searchTermChanged)="onSearchtermChange($event)"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
     />
  <!-- list header -->
  <ion-toolbar color="primary" class="ion-hide-sm-down">
    <ion-item color="primary" lines="none">
      <ion-label class="clickable" (click)="setSort('name')"><strong>{{ store.i18n.name() }}{{ sortIcon('name') }}</strong></ion-label>
      <ion-label class="clickable" (click)="setSort('value')"><strong>{{ store.i18n.value() }}{{ sortIcon('value') }}</strong></ion-label>
      <ion-label class="ion-hide-md-down"><strong>{{ store.i18n.description() }}</strong></ion-label>
    </ion-item>
  </ion-toolbar>
</ion-header>

<!-- list data -->
<ion-content #content>
@if(isLoading()) {
  <okr-spinner />
} @else {
  @if(selectedResourcesCount() === 0) {
    <okr-empty-list [message]="store.i18n.empty()" />
  } @else {
    <ion-list lines="inset">
      @for(resource of filteredResources(); track $index) {
        <ion-item class="ion-text-wrap" (click)="showActions(resource)">
          <ion-icon slot="start" src="{{ getIcon(resource) | svgIcon }}" />
          <ion-label>{{ resource?.name }}</ion-label>
          <ion-label class="ion-hide-sm-down">{{ resource?.currentValue }}</ion-label>
          <ion-label class="ion-hide-sm-down">{{ resource?.description }}</ion-label>
        </ion-item>
      }
    </ion-list>
  }
}
</ion-content>
  `
})
export class ResourceList {
  protected readonly menuItemsStore = inject(MenuItemsStore);
  protected readonly popupId = contextMenuId('c_resource');
  protected readonly store = inject(ResourceStore);
  protected readonly ownershipStore = inject(OwnershipStore);

  // inputs
  public listId = input.required<string>();
  public filter = input.required<string>();
  public contextMenuName = input.required<string>();

  // sort state
  private sortField = signal<ResourceSortField>('name');
  private sortAsc   = signal(true);

  // derived signals
  protected filteredResources = computed(() => {
    const list = this.store.filteredResources() ?? [];
    const field = this.sortField();
    const dir   = this.sortAsc() ? 1 : -1;
    return [...list].sort((a, b) => dir * (
      field === 'value' ? (a.currentValue ?? 0) - (b.currentValue ?? 0) :
                          (a.name ?? '').localeCompare(b.name ?? '')
    ));
  });
  protected resourcesCount = computed(() => this.store.resourcesCount());
  protected selectedResourcesCount = computed(() => this.filteredResources().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected readonly tags = computed(() => this.store.getResourceTags());
  protected readonly types = computed(() => this.store.appStore.getCategory('resource_type'));
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));


  /******************************** getters ******************************************* */
  protected getIcon(resource: ResourceModel): string {
    let iconName: string;
    if (resource.type === 'rboat')
      iconName = this.store.appStore.getCategoryItem('rboat_type', resource.subType)?.icon ?? '';
    else
      iconName = this.store.appStore.getCategoryItem('resource_type', resource.type)?.icon ?? '';
    return iconName ?? '';
  }

  protected sortIcon(field: ResourceSortField): string {
    if (this.sortField() !== field) return '';
    return this.sortAsc() ? ' ↑' : ' ↓';
  }

  /******************************** setters (filter/sort) ******************************************* */
  protected setSort(field: ResourceSortField): void {
    this.sortAsc.set(this.sortField() === field ? !this.sortAsc() : true);
    this.sortField.set(field);
  }

  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedResourceType(type);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch(selectedMethod) {
      case 'add':  await this.store.add(true, this.readOnly()); break;
      case 'exportRaw': await this.store.export('raw', 'resource'); break;
      default: error(undefined, `ResourceListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays the two-level ActionSheet of a resource: the resource itself, its current user (Nutzer/in) and
   * its current ownership (Nutzung). Only the actions the user has permission for are offered.
   * @param resource
   */
  protected async showActions(resource: ResourceModel): Promise<void> {
    const action = await this.ownershipStore.showResourceActions(resource, this.ownershipStore.currentOwnershipOf(resource.okey));
    if (action) this.store.reload();
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}

