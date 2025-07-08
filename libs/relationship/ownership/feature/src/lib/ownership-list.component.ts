import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonTitle, IonToolbar, IonItemSliding, IonItemOptions, IonItemOption, IonBackdrop, IonAvatar, IonImg, IonList, IonPopover } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { AvatarPipe, CategoryNamePipe, DurationPipe, SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { getYearList, hasRole } from '@bk2/shared/util-core';
import { error } from '@bk2/shared/util-angular';
import { OwnershipModel, RoleName } from '@bk2/shared/models';
import { addAllCategory, GenderTypes, ResourceTypes, RowingBoatTypes } from '@bk2/shared/categories';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { getOwnerName } from '@bk2/relationship/ownership/util';
import { OwnershipListStore } from './ownership-list.store';

@Component({
    selector: 'bk-ownership-list',
    imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, DurationPipe, CategoryNamePipe, AvatarPipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
    IonLabel, IonContent, IonItem, IonItemOptions, IonItemOption, 
    IonBackdrop, IonAvatar, IonImg, IonList, IonPopover
],
    providers: [OwnershipListStore],
    template: `
    <ion-header>
    <ion-toolbar color="secondary" id="bkheader">
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
      [tags]="ownershipTags()"
      [types]="types()"
      [typeName]="typeName()"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeSelected($event)"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      @if(listId() === 'scsBoats') {
        <ion-item color="primary" lines="none">
          <ion-label><strong>{{ '@input.boatName.label' | translate | async }}</strong></ion-label>
          <ion-label><strong>{{ '@input.boatType.label' | translate | async }}</strong></ion-label>
          <ion-label class="ion-hide-md-down"><strong>{{ '@ownership.list.header.duration' | translate | async }}</strong></ion-label>
        </ion-item>
      }
      @else {
        <ion-item lines="none" color="primary">
          <ion-label><strong>{{'@ownership.list.header.ownerName' | translate | async}}</strong></ion-label>
          <ion-label><strong>{{'@ownership.list.header.resourceName' | translate | async}}</strong></ion-label>
          <ion-label class="ion-hide-md-down"><strong>{{'@ownership.list.header.duration' | translate | async}}</strong></ion-label>
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
        <bk-empty-list message="@ownership.list.empty" />
      } @else {
        <ion-list lines="inset">
          @for(ownership of filteredOwnerships(); track $index) {
            <ion-item-sliding #slidingItem>
              @if(listId() === 'scsBoats') {
                <ion-item class="ion-text-wrap" (click)="edit(undefined, ownership)">
                  <ion-icon slot="start" color="primary" src="{{ getIcon(ownership) | svgIcon }}" />
                  <ion-label>{{ ownership.resourceName }}</ion-label>
                  <ion-label>{{ ownership.resourceSubType | categoryName:boatTypes }}</ion-label>
                  <ion-label class="ion-hide-md-down">{{ ownership.validFrom | duration:ownership.validTo }}</ion-label>
                </ion-item>
              }
              @else {
                <ion-item (click)="edit(undefined, ownership)">
                  <ion-avatar slot="start">
                    <ion-img src="{{ ownership.ownerModelType + '.' + ownership.ownerKey | avatar | async }}" alt="Avatar Logo" />
                  </ion-avatar>
                  <ion-label>{{getOwnerName(ownership)}}</ion-label>      
                  <ion-label>{{ownership.resourceName}}</ion-label>      
                  <ion-label class="ion-hide-md-down">{{ownership.validFrom | duration:ownership.validTo}}</ion-label>
                </ion-item>
              }
              @if(hasRole('resourceAdmin')) {
                <ion-item-options side="end">
                  <ion-item-option color="danger" (click)="delete(slidingItem, ownership)">
                    <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                  </ion-item-option>
                  <ion-item-option color="warning" (click)="end(slidingItem, ownership)">
                    <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                  </ion-item-option>
                  <ion-item-option color="primary" (click)="edit(slidingItem, ownership)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
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
export class OwnershipListComponent {
  protected ownershipListStore = inject(OwnershipListStore);
  
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredOwnerships = computed(() => {
    switch (this.listId()) {
      case 'ownerships': return this.ownershipListStore.filteredOwnerships() ?? [];
      case 'lockers':    return this.ownershipListStore.filteredLockers() ?? [];
      case 'keys':       return this.ownershipListStore.filteredKeys() ?? [];
      case 'privateBoats':    return this.ownershipListStore.filteredPrivateBoats();
      case 'scsBoats':   return this.ownershipListStore.filteredScsBoats();
      case 'all':       
      default:          return this.ownershipListStore.filteredAllOwnerships() ?? [];
    }
  });
  protected ownershipsCount = computed(() => {
    switch (this.listId()) {
      case 'ownerships': return this.ownershipListStore.ownershipsCount();
      case 'lockers':    return this.ownershipListStore.lockersCount();
      case 'keys':       return this.ownershipListStore.keysCount();
      case 'privateBoats':    return this.ownershipListStore.privateBoatsCount();
      case 'scsBoats':   return this.ownershipListStore.scsBoatsCount();
      case 'all':       
      default:          return this.ownershipListStore.allOwnershipsCount() ?? [];
    }
  });
  protected title = computed(() => {
    return `@ownership.list.${this.listId()}.title`;
  });

  protected types = computed(() => {
    switch (this.listId()) {
      case 'privateBoats':
      case 'lockers':  return addAllCategory(GenderTypes);
      case 'keys':     return undefined;
      case 'scsBoats': return addAllCategory(RowingBoatTypes);
      case 'all':     
      default:         return addAllCategory(ResourceTypes);
    }
  });
  protected typeName = computed(() => {
    switch (this.listId()) {
      case 'privateBoats':
      case 'lockers':  return 'gender';
      case 'keys':     return undefined;
      case 'scsBoats': return 'rowingBoatType';
      case 'all':     
      default:         return 'resourceType';
    }
  });
  protected readonly years = getYearList();

  protected selectedOwnershipsCount = computed(() => this.filteredOwnerships().length);
  protected isLoading = computed(() => this.ownershipListStore.isLoading());
  protected ownershipTags = computed(() => this.ownershipListStore.getTags());
  protected popupId = computed(() => 'c_ownerships_' + this.listId());

  protected boatTypes = RowingBoatTypes;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.ownershipListStore.add(); break;
      case 'exportRaw': await this.ownershipListStore.export("raw"); break;
      default: error(undefined, `OwnershipListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async delete(slidingItem?: IonItemSliding, ownership?: OwnershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.ownershipListStore.delete(ownership);
  }

  public async end(slidingItem?: IonItemSliding, ownership?: OwnershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (ownership) await this.ownershipListStore.end(ownership);
  }

  public async edit(slidingItem?: IonItemSliding, ownership?: OwnershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.ownershipListStore.edit(ownership);
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.ownershipListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.ownershipListStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: number): void {
    switch (this.listId()) {
      case 'privateBoats':
      case 'lockers':  
        this.ownershipListStore.setSelectedGender(type);
        break;
      case 'scsBoats': 
        this.ownershipListStore.setSelectedRowingBoatType(type);
        break;
      case 'all':
      case 'ownerships':
        this.ownershipListStore.setSelectedResourceType(type);
        break;
      default:
        break;
    }  
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.ownershipListStore.currentUser());
  }

  protected getOwnerName(ownership: OwnershipModel): string {
    return getOwnerName(ownership);
  }  

  protected getIcon(ownership: OwnershipModel): string {
    return this.boatTypes[ownership.resourceSubType ?? 0].icon;
  }
}
