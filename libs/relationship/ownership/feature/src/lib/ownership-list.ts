import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonBackdrop, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@okr/shared-i18n';
import { OwnershipModel, PersonModelName, RoleName } from '@okr/shared-models';
import { DurationPipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { getCategoryIcon, getItemLabel, getYearList, hasRole, isOngoing } from '@okr/shared-util-core';

import { AvatarPipe } from '@okr/avatar-ui';
import { Menu } from '@okr/cms-menu-feature';
import { getOwnerName } from '@okr/relationship-ownership-util';

import { OwnershipStore } from './ownership.store';

type OwnershipSortField = 'owner' | 'name' | 'type' | 'duration';

@Component({
  selector: 'okr-ownership-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, DurationPipe, AvatarPipe,
    Spinner, ListFilter, EmptyList, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonBackdrop, IonAvatar, IonImg, IonList, IonPopover
  ],
  providers: [OwnershipStore],
  styles: [`.clickable { cursor: pointer; user-select: none; }`],
  template: `
    <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title class="ion-hide-md-down">{{ selectedOwnershipsCount()}}/{{ownershipsCount()}} {{ title() | translate | async }}</ion-title>
      <ion-title class="ion-hide-md-up">{{ selectedOwnershipsCount()}} {{ title() | translate | async }}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
    <okr-list-filter class="ion-hide-md-down"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
    />
    <okr-list-filter class="ion-hide-md-up"
      (searchTermChanged)="onSearchtermChange($event)"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
    />

    <!-- list header -->
    <ion-toolbar color="primary" class="ion-hide-md-down">
      @if(listId() === 'scsBoats') {
        <ion-item color="primary" lines="none">
          <ion-label class="clickable" (click)="setSort('name')"><strong>{{ store.i18n.boat_name() }}{{ sortIcon('name') }}</strong></ion-label>
          <ion-label class="clickable" (click)="setSort('type')"><strong>{{ store.i18n.boat_type() }}{{ sortIcon('type') }}</strong></ion-label>
          <ion-label class="ion-hide-md-down clickable" (click)="setSort('duration')"><strong>{{ store.i18n.duration() }}{{ sortIcon('duration') }}</strong></ion-label>
        </ion-item>
      }
      @else {
        <ion-item lines="none" color="primary">
          <ion-label class="clickable" (click)="setSort('owner')"><strong>{{ store.i18n.owner_name() }}{{ sortIcon('owner') }}</strong></ion-label>
          <ion-label class="clickable" (click)="setSort('name')"><strong>{{ store.i18n.resource_name() }}{{ sortIcon('name') }}</strong></ion-label>
          <ion-label class="ion-hide-md-down clickable" (click)="setSort('duration')"><strong>{{ store.i18n.duration() }}{{ sortIcon('duration') }}</strong></ion-label>
        </ion-item>
      }
    </ion-toolbar>
  </ion-header>

  <!-- Data -->
  <ion-content #content>
    @if(isLoading()) {
      <okr-spinner />
      <ion-backdrop />
    } @else {
      @if(filteredOwnerships().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(ownership of filteredOwnerships(); track ownership.okey) {
            @if(listId() === 'scsBoats') {
              <ion-item class="ion-text-wrap" (click)="showActions(ownership)">
                <ion-icon slot="start" src="{{ getIcon(ownership) | svgIcon }}" />
                <ion-label>{{ ownership.resourceName }}</ion-label>
                <ion-label>{{ typeLabel(ownership.resourceSubType) | translate | async }}</ion-label>
                <ion-label class="ion-hide-md-down">{{ ownership.validFrom | duration:ownership.validTo }}</ion-label>
              </ion-item>
            }
            @else {
              <ion-item (click)="showActions(ownership)">
                <ion-avatar slot="start" [style.background-color]="'var(--ion-color-light)'">
                  <ion-img src="{{ ownership.ownerModelType + '.' + ownership.ownerKey | avatar:(ownership.ownerModelType === 'person' ? 'person' : 'org') }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{getOwnerName(ownership)}}</ion-label>      
                <ion-label>{{ownership.resourceName}}</ion-label>      
                <ion-label class="ion-hide-md-down">{{ownership.validFrom | duration:ownership.validTo}}</ion-label>
              </ion-item>
            }
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class OwnershipList {
  protected store = inject(OwnershipStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());

  // sort state (local: the store serves every ownership list variant)
  private sortField = signal<OwnershipSortField>('name');
  private sortAsc   = signal(true);

  protected filteredOwnerships = computed(() => {
    const list = (() => {
      switch (this.listId()) {
        case 'ownerships':    return this.store.filteredOwnerships() ?? [];
        case 'lockers':       return this.store.filteredLockers() ?? [];
        case 'keys':          return this.store.filteredKeys() ?? [];
        case 'privateBoats':  return this.store.filteredPrivateBoats();
        case 'scsBoats':      return this.store.filteredScsBoats();
        case 'all':
        default:              return this.store.filteredAllOwnerships() ?? [];
      }
    })();
    const field = this.sortField();
    const dir   = this.sortAsc() ? 1 : -1;
    return [...list].sort((a, b) => dir * (
      field === 'owner'    ? getOwnerName(a).localeCompare(getOwnerName(b)) :
      field === 'type'     ? (a.resourceSubType ?? '').localeCompare(b.resourceSubType ?? '') :
      field === 'duration' ? (a.validFrom ?? '').localeCompare(b.validFrom ?? '') :
                             (a.resourceName ?? '').localeCompare(b.resourceName ?? '')
    ));
  });
  protected ownershipsCount = computed(() => {
    switch (this.listId()) {
      case 'ownerships':    return this.store.ownershipsCount();
      case 'lockers':       return this.store.lockersCount();
      case 'keys':          return this.store.keysCount();
      case 'privateBoats':  return this.store.privateBoatsCount();
      case 'scsBoats':      return this.store.scsBoatsCount();
      case 'all':
      default:              return this.store.allOwnershipsCount() ?? [];
    }
  });
  protected title = computed(() => {
     return `@relationship/ownership/feature.list.${this.listId()}.title`;
  });

  protected selectedType = linkedSignal(() => {
    switch (this.listId()) {
      case 'privateBoats':
      case 'lockers':
        return this.store.selectedGender();
      case 'scsBoats':
        return this.store.selectedRowingBoatType();
      case 'all':
      case 'ownerships':
        return this.store.selectedResourceType();
      default:
        return 'all';
    }
  });

  protected types = computed(() => {
    switch (this.listId()) {
      case 'privateBoats':
      case 'lockers': return this.store.appStore.getCategory('gender');
      case 'keys': return undefined;
      case 'scsBoats': return this.store.appStore.getCategory('rboat_type');
      case 'all':
      default: return this.store.appStore.getCategory('resource_type');
    }
  });

  protected readonly years = getYearList();

  protected selectedOwnershipsCount = computed(() => this.filteredOwnerships().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected popupId = computed(() => 'c_ownerships_' + this.listId());

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;
  private rboatTypes = computed(() => this.store.appStore.tryGetCategory('rboat_type'));
  private resourceTypes = computed(() => this.store.appStore.tryGetCategory('resource_type'));

  /** i18n key of an rboat_type item — data-driven, so it goes through TranslatePipe, not the store. */
  protected typeLabel(subType: string): string {
    const category = this.rboatTypes();
    return category ? getItemLabel(category, subType) : subType;
  }

  protected sortIcon(field: OwnershipSortField): string {
    if (this.sortField() !== field) return '';
    return this.sortAsc() ? ' ↑' : ' ↓';
  }

  /******************************** setters (filter/sort) ******************************************* */
  protected setSort(field: OwnershipSortField): void {
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
    switch (this.listId()) {
      case 'privateBoats':
      case 'lockers':
        this.store.setSelectedGender(type);
        break;
      case 'scsBoats':
        this.store.setSelectedRowingBoatType(type);
        break;
      case 'all':
      case 'ownerships':
        this.store.setSelectedResourceType(type);
        break;
      default:
        break;
    }
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add': await this.store.add(undefined, PersonModelName, undefined, this.readOnly()); break;
      case 'exportRaw': await this.store.export('raw', this.listId()); break;
      default: error(undefined, `OwnershipList.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Ownership. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param ownership 
   */
  protected async showActions(ownership: OwnershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, ownership);
    await this.executeActions(actionSheetOptions, ownership);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param ownership 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, ownership: OwnershipModel): void {
    if (hasRole('resourceAdmin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('ownership.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      if (isOngoing(ownership.validTo)) {
        actionSheetOptions.buttons.push(createActionSheetButton('ownership.end', this.store.i18n.end(), this.imgixBaseUrl, 'stop-circle'));
      }
    }
    if (hasRole('admin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('ownership.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('ownership.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));

    // shortcut to open the owned rowing boat (rboat) directly
    if (ownership.resourceType === 'rboat') {
      if (this.hasRole('resourceAdmin')) {
        actionSheetOptions.buttons.push(createActionSheetButton('rboat.edit', this.store.i18n.boat_edit(), this.imgixBaseUrl, 'boat'));
      } else {
        actionSheetOptions.buttons.push(createActionSheetButton('rboat.view', this.store.i18n.boat_view(), this.imgixBaseUrl, 'boat'));
      }
    }

    // shortcut to open the owner (person or org) directly
    if (this.hasRole('resourceAdmin')) {
      actionSheetOptions.buttons.push(createActionSheetButton('owner.edit', this.store.i18n.owner_edit(), this.imgixBaseUrl, 'person'));
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton('owner.view', this.store.i18n.owner_view(), this.imgixBaseUrl, 'person'));
    }

    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param ownership 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, ownership: OwnershipModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'ownership.delete':
          await this.store.delete(ownership, this.readOnly());
          break;
        case 'ownership.edit':
          await this.store.edit(ownership, this.readOnly());
          break;
        case 'ownership.view':
          await this.store.edit(ownership, true);
          break;
        case 'ownership.end':
          await this.store.end(ownership, this.readOnly());
          break;
        case 'rboat.edit':
          await this.store.openResource(ownership, false);
          break;
        case 'rboat.view':
          await this.store.openResource(ownership, true);
          break;
        case 'owner.edit':
          await this.store.openOwner(ownership, false);
          break;
        case 'owner.view':
          await this.store.openOwner(ownership, true);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected getOwnerName(ownership: OwnershipModel): string {
    return getOwnerName(ownership);
  }

  protected getIcon(ownership: OwnershipModel): string {
    if (ownership.resourceType === 'rboat') {
      return getCategoryIcon(this.rboatTypes(), ownership.resourceSubType);
    } else {
      return getCategoryIcon(this.resourceTypes(), ownership.resourceType);
    }
  }
}
