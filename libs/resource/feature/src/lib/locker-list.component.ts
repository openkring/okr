import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { RoleName } from '@bk2/shared/config';
import { error, hasRole } from '@bk2/shared/util';
import { TranslatePipe } from '@bk2/shared/i18n';
import { PartPipe, SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { AllCategories, GenderType, ResourceModel } from '@bk2/shared/models';
import { addAllCategory, GenderTypes } from '@bk2/shared/categories';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { ResourceListStore } from './resource-list.store';

@Component({
  selector: 'bk-locker-list',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PartPipe,
    SpinnerComponent, EmptyListComponent,
    MenuComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList, IonPopover,
    IonIcon, IonItem, IonLabel, IonContent, IonItemSliding, IonItemOption, IonItemOptions
  ],
  providers: [ResourceListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedLockersCount()}}/{{lockersCount() }} {{ title | translate | async}}</ion-title>
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
      [tags]="lockerTags()"
      [types]="allGenders"
      typeName="gender"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeSelected($event)"
     />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item color="primary" lines="none">
        <ion-label><strong>{{ '@input.lockerNr.label' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@input.keyNr.label' | translate | async }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if(selectedLockersCount() === 0) {
      <bk-empty-list message="@resource.locker.field.empty" />
    } @else {
      <ion-list lines="inset">
        @for(resource of filteredLockers(); track $index) {
          <ion-item-sliding #slidingItem>
            <ion-item class="ion-text-wrap" (click)="edit(undefined, resource)">
              <ion-icon slot="start" src="{{ getIcon(resource) | svgIcon }}" />
              <ion-label>{{ resource.name | part:true:'/' }}</ion-label>
              <ion-label>{{ resource.name | part:false:'/' }}</ion-label>
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
export class LockerListComponent {
  protected readonly resourceListStore = inject(ResourceListStore);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredLockers = computed(() => this.resourceListStore.filteredLockers() ?? []);
  protected lockersCount = computed(() => this.resourceListStore.lockersCount());
  protected selectedLockersCount = computed(() => this.filteredLockers().length);
  protected isLoading = computed(() => this.resourceListStore.isLoading());
  protected lockerTags = computed(() => this.resourceListStore.getLockerTags());
  protected title = '@resource.locker.plural';
  
  protected selectedCategory = AllCategories;
  protected allGenders = addAllCategory(GenderTypes);

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.resourceListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.resourceListStore.setSelectedTag($event);
  }

  protected onTypeSelected(gender: number): void {
    this.resourceListStore.setSelectedGender(gender);
  }

  /******************************** getters ******************************************* */
  protected getIcon(resource: ResourceModel): string {
    switch(resource.subType) {
      case GenderType.Male: return 'gender_male';
      case GenderType.Female: return 'gender_female';
      case GenderType.Other: return 'gender_diverse';
      default: return 'help';
    }
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.resourceListStore.add(false); break;
      case 'exportRaw': await this.resourceListStore.export("raw"); break;
      default: error(undefined, `LockerListComponent.call: unknown method ${_selectedMethod}`);
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

