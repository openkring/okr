import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular';
import { ResourceModel, RoleName } from '@okr/shared-models';
import { PartPipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { error } from '@okr/shared-util-angular';
import { hasRole, contextMenuId } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';

import { OwnershipStore } from '@okr/relationship-ownership-feature';

import { RESOURCE_EDIT_MODAL_PROVIDER } from './resource-edit-modal.provider';
import { ResourceStore } from './resource.store';

@Component({
  selector: 'okr-locker-list',
  standalone: true,
  imports: [
    SvgIconPipe, PartPipe,
    Spinner, EmptyList, Menu, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList, IonPopover,
    IonIcon, IonItem, IonLabel, IonContent
  ],
  providers: [ResourceStore, OwnershipStore, RESOURCE_EDIT_MODAL_PROVIDER],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title class="ion-hide-sm-down">{{selectedLockersCount()}}/{{lockersCount() }} {{ store.i18n.locker_plural() }}</ion-title>
      <ion-title class="ion-hide-sm-up">{{selectedLockersCount()}} {{ store.i18n.locker_plural() }}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
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
        <ion-label><strong>{{ store.i18n.locker_nr() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.key_nr() }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <okr-spinner />
  } @else {
    @if(selectedLockersCount() === 0) {
      <okr-empty-list [message]="store.i18n.locker_empty()" />
    } @else {
      <ion-list lines="inset">
        @for(locker of filteredLockers(); track $index) {
          <ion-item class="ion-text-wrap" (click)="showActions(locker)">
            <ion-icon slot="start" src="{{ getIcon(locker) | svgIcon }}" />
            <ion-label>{{ locker.name | part:true:'/' }}</ion-label>
            <ion-label>{{ locker.name | part:false:'/' }}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  }
</ion-content>
  `
})
export class LockerList {
  protected readonly popupId = contextMenuId('c_resource');
  protected readonly store = inject(ResourceStore);
  protected readonly ownershipStore = inject(OwnershipStore);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedResourceType());

  // data
  protected filteredLockers = computed(() => this.store.filteredLockers() ?? []);
  protected lockersCount = computed(() => this.store.lockersCount());
  protected selectedLockersCount = computed(() => this.filteredLockers().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags('locker'));
  protected types = computed(() => this.store.appStore.getCategory('gender'));
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));


  /******************************** getters ******************************************* */
  protected getIcon(resource: ResourceModel): string {
    switch(resource.subType) {
      case 'male': return 'gender_male';
      case 'female': return 'gender_female';
      case 'other': return 'gender_diverse';
      default: return 'help';
    }
  }

  /******************************** setters (filter) ******************************************* */
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
      case 'add':  await this.store.add(false, false); break;
      case 'exportRaw': await this.store.export('raw', 'locker'); break;
      default: error(undefined, `LockerListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays the two-level ActionSheet of a locker: the locker itself, its current user (Nutzer/in) and
   * its current ownership (Nutzung). Only the actions the user has permission for are offered.
   * @param locker
   */
  protected async showActions(locker: ResourceModel): Promise<void> {
    const action = await this.ownershipStore.showResourceActions(locker, this.ownershipStore.currentOwnershipOf(locker.okey));
    if (action) this.store.reload();
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}

