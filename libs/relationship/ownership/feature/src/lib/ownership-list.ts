import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonBackdrop, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { OwnershipModel, PersonModelName, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getCategoryIcon, getYearList, hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { Menu } from '@bk2/cms-menu-feature';
import { getOwnerName } from '@bk2/relationship-ownership-util';

import { OwnershipStore } from './ownership.store';

@Component({
  selector: 'bk-ownership-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, DurationPipe, AvatarPipe,
    Spinner, ListFilter, EmptyList, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonBackdrop, IonAvatar, IonImg, IonList, IonPopover
  ],
  providers: [OwnershipStore],
  template: `
    <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedOwnershipsCount()}}/{{ownershipsCount()}} {{ title() | translate | async }}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
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

    <!-- search and filters -->
    <bk-list-filter
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      @if(listId() === 'scsBoats') {
        <ion-item color="primary" lines="none">
          <ion-label><strong>{{ store.i18n.boat_name() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.boat_type() }}</strong></ion-label>
          <ion-label class="ion-hide-md-down"><strong>{{ store.i18n.duration() }}</strong></ion-label>
        </ion-item>
      }
      @else {
        <ion-item lines="none" color="primary">
          <ion-label><strong>{{ store.i18n.owner_name() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.resource_name() }}</strong></ion-label>
          <ion-label class="ion-hide-md-down"><strong>{{ store.i18n.duration() }}</strong></ion-label>
        </ion-item>
      }
    </ion-toolbar>
  </ion-header>

  <!-- Data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-spinner />
      <ion-backdrop />
    } @else {
      @if(filteredOwnerships().length === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(ownership of filteredOwnerships(); track $index) {
            @if(listId() === 'scsBoats') {
              <ion-item class="ion-text-wrap" (click)="showActions(ownership)">
                <ion-icon slot="start" src="{{ getIcon(ownership) | svgIcon }}" />
                <ion-label>{{ ownership.resourceName }}</ion-label>
                <ion-label>{{ ownership.resourceSubType }}</ion-label>
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

  protected filteredOwnerships = computed(() => {
    switch (this.listId()) {
      case 'ownerships': return this.store.filteredOwnerships() ?? [];
      case 'lockers': return this.store.filteredLockers() ?? [];
      case 'keys': return this.store.filteredKeys() ?? [];
      case 'privateBoats': return this.store.filteredPrivateBoats();
      case 'scsBoats': return this.store.filteredScsBoats();
      case 'all':
      default: return this.store.filteredAllOwnerships() ?? [];
    }
  });
  protected ownershipsCount = computed(() => {
    switch (this.listId()) {
      case 'ownerships': return this.store.ownershipsCount();
      case 'lockers': return this.store.lockersCount();
      case 'keys': return this.store.keysCount();
      case 'privateBoats': return this.store.privateBoatsCount();
      case 'scsBoats': return this.store.scsBoatsCount();
      case 'all':
      default: return this.store.allOwnershipsCount() ?? [];
    }
  });
  protected title = computed(() => {
    return `@ownership.list.${this.listId()}.title`;
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
  private rboatTypes = this.store.appStore.getCategory('rboat_type');
  private resourceTypes = this.store.appStore.getCategory('resource_type');

  /******************************** setters (filter) ******************************************* */
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
    switch (selectedMethod) {
      case 'add': await this.store.add(undefined, PersonModelName, undefined, this.readOnly()); break;
      case 'exportRaw': await this.store.export("raw"); break;
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
      actionSheetOptions.buttons.push(createActionSheetButton('ownership.edit', this.store.i18n.edit(), this.imgixBaseUrl, 'edit'));
      if (isOngoing(ownership.validTo)) {
        actionSheetOptions.buttons.push(createActionSheetButton('ownership.end', this.store.i18n.end(), this.imgixBaseUrl, 'stop-circle'));
      }
    }
    if (hasRole('admin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('ownership.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('ownership.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
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
      return getCategoryIcon(this.rboatTypes, ownership.resourceSubType);
    } else {
      return getCategoryIcon(this.resourceTypes, ownership.resourceType);
    }
  }
}
