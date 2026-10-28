import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular';
import { ResourceModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { error } from '@okr/shared-util-angular';
import { hasRole, contextMenuId } from '@okr/shared-util-core';
import { DEFAULT_TAGS } from '@okr/shared-constants';

import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';

import { OwnershipStore } from '@okr/relationship-ownership-feature';

import { RESOURCE_EDIT_MODAL_PROVIDER } from './resource-edit-modal.provider';
import { ResourceStore } from './resource.store';

@Component({
  selector: 'okr-key-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, EmptyList, Menu, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList,
    IonIcon, IonItem, IonLabel, IonContent, IonPopover
  ],
  providers: [ResourceStore, OwnershipStore, RESOURCE_EDIT_MODAL_PROVIDER],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedKeysCount()}}/{{keysCount() }} {{ store.i18n.key_plural() }}</ion-title>
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
    <okr-list-filter
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)" [tags]="tags()"
     />

    <!-- list header -->
  <ion-toolbar color="primary">
    <ion-item color="primary" lines="none">
      <ion-label><strong>{{ store.i18n.key_name() }}</strong></ion-label>
      <ion-label><strong>{{ store.i18n.description() }}</strong></ion-label>
    </ion-item>
  </ion-toolbar>
</ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <okr-spinner />
  } @else {
    @if(selectedKeysCount() === 0) {
      <okr-empty-list [message]="store.i18n.key_empty()" />
    } @else {
      <ion-list lines="full">
        @for(key of filteredKeys(); track $index) {
          <ion-item class="ion-text-wrap" (click)="showActions(key)">
            <ion-icon slot="start" src="{{ 'key' | svgIcon }}" />
            <ion-label>{{ key.name }}</ion-label>
            <ion-label>{{ key.description }}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  }
</ion-content>
  `
})
export class KeyList {
  protected readonly menuItemsStore = inject(MenuItemsStore);
  protected readonly popupId = contextMenuId('c_key');
  protected readonly store = inject(ResourceStore);
  protected readonly ownershipStore = inject(OwnershipStore);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();
  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());

  // data
  protected filteredKeys = computed(() => this.store.filteredKeys() ?? []);
  protected keysCount = computed(() => this.store.keysCount());
  protected selectedKeysCount = computed(() => this.filteredKeys().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags('key') ?? DEFAULT_TAGS);
  protected currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch(selectedMethod) {
      case 'add':  await this.store.add(false, false); break;
      case 'exportRaw': await this.store.export('raw', 'key'); break;
      default: error(undefined, `BoatListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays the two-level ActionSheet of a key: the key itself, its current user (Nutzer/in) and
   * its current ownership (Nutzung). Only the actions the user has permission for are offered.
   * @param key
   */
  protected async showActions(key: ResourceModel): Promise<void> {
    const action = await this.ownershipStore.showResourceActions(key, this.ownershipStore.currentOwnershipOf(key.okey));
    if (action) this.store.reload();
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}

