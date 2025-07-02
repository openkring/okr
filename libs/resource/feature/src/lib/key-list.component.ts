import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { hasRole } from '@bk2/shared/util-core';
import { error } from '@bk2/shared/util-angular';
import { TranslatePipe } from '@bk2/shared/i18n';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { ResourceModel, RoleName } from '@bk2/shared/models';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { ResourceListStore } from './resource-list.store';

@Component({
  selector: 'bk-key-list',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent,
    MenuComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList,
    IonIcon, IonItem, IonLabel, IonContent, IonItemSliding, 
    IonItemOption, IonItemOptions, IonPopover
  ],
  providers: [ResourceListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedKeysCount()}}/{{keysCount() }} {{ title | translate | async}}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c_key">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c_key" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      [tags]="keyTags()"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
     />

    <!-- list header -->
  <ion-toolbar color="primary">
    <ion-item color="primary" lines="none">
      <ion-label><strong>{{ '@input.keyName.label' | translate | async }}</strong></ion-label>
      <ion-label><strong>{{ '@input.description.label' | translate | async }}</strong></ion-label>
    </ion-item>
  </ion-toolbar>
</ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if(selectedKeysCount() === 0) {
      <bk-empty-list message="@resource.key.field.empty" />
    } @else {
      <ion-list lines="full">
        @for(key of filteredKeys(); track $index) {
          <ion-item-sliding #slidingItem>
            <ion-item class="ion-text-wrap" (click)="edit(undefined, key)">
              <ion-icon slot="start" src="{{ 'resource_key' | svgIcon }}" />
              <ion-label>{{ key.name }}</ion-label>
              <ion-label>{{ key.description }}</ion-label>
            </ion-item>
            @if(hasRole('resourceAdmin')) {
              <ion-item-options side="end">
                <ion-item-option color="primary" (click)="edit(slidingItem, key)">
                  <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                </ion-item-option>
                <ion-item-option color="danger" (click)="delete(slidingItem, key)">
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
export class KeyListComponent {
  protected readonly resourceListStore = inject(ResourceListStore);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredKeys = computed(() => this.resourceListStore.filteredKeys() ?? []);
  protected keysCount = computed(() => this.resourceListStore.keysCount());
  protected selectedKeysCount = computed(() => this.filteredKeys().length);
  protected isLoading = computed(() => this.resourceListStore.isLoading());
  protected keyTags = computed(() => this.resourceListStore.getKeyTags() ?? []);
  protected title = '@resource.key.plural'
  
  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.resourceListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.resourceListStore.setSelectedTag($event);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.resourceListStore.add(false); break;
      case 'exportRaw': await this.resourceListStore.export("raw"); break;
      default: error(undefined, `BoatListComponent.call: unknown method ${_selectedMethod}`);
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

