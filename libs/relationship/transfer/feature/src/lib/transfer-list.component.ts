import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonTitle, IonToolbar, IonItemSliding, IonList, IonItemOptions, IonItemOption, IonPopover } from '@ionic/angular/standalone';

import { error, TranslatePipe } from '@bk2/shared/i18n';
import { CategoryNamePipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { AvatarDisplayComponent, EmptyListComponent, ListFilterComponent } from '@bk2/shared/ui';
import { TransferModel } from '@bk2/shared/models';
import { addAllCategory, TransferStates, TransferTypes } from '@bk2/shared/categories';
import { RoleName } from '@bk2/shared/config';
import { getYearList, hasRole } from '@bk2/shared/util';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { TransferListStore } from './transfer-list.store';

@Component({
  selector: 'bk-transfer-list',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PrettyDatePipe, CategoryNamePipe,
    EmptyListComponent, ListFilterComponent, AvatarDisplayComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
    IonLabel, IonContent, IonItem, IonList, IonItemOptions, IonItemOption, IonPopover
  ],
  providers: [TransferListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedTransfersCount()}}/{{transfersCount()}} {{ '@transfer.plural' | translate | async }}</ion-title>
      <ion-buttons slot="end">
        @if(hasRole('privileged') || hasRole('resourceAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="c-transfers">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-transfers" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>                  }
      </ion-buttons>
    </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter 
      [tags]="transferTags()"
      [types]="allTransferTypes"
      typeName="transferType"
      [years]="years"
      [states]="allTransferStates"
      stateName="transferState"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeChange($event)"
      (stateChanged)="onStateChange($event)"
      (yearChanged)="onYearChange($event)"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label class="ion-hide-md-down"><strong>{{ '@transfer.list.header.dateOfTransfer' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@transfer.list.header.subject' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@transfer.list.header.object' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@transfer.list.header.resource' | translate | async }}</strong></ion-label>
        <ion-label class="ion-hide-lg-down"><strong>{{ '@transfer.list.header.name' | translate | async }}</strong></ion-label>
        <ion-label class="ion-hide-lg-down"><strong>{{ '@transfer.list.header.state' | translate | async }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(selectedTransfersCount() === 0) {
      <bk-empty-list message="@transfer.field.empty" />
    } @else {
      <ion-list lines="inset">
        @for(transfer of filteredTransfers(); track $index) {
          <ion-item-sliding #slidingItem>
            <ion-item (click)="edit(undefined, transfer)" detail="false">
            <ion-label class="ion-hide-md-down">{{transfer.dateOfTransfer | prettyDate}}</ion-label>
              <ion-label><bk-avatar-display [avatars]="transfer.subjects" /></ion-label>
              <ion-label><bk-avatar-display [avatars]="transfer.objects" /></ion-label>
              <ion-label>{{transfer.resource.name}}</ion-label>
              <ion-label class="ion-hide-lg-down">{{transfer.name}}</ion-label>
              <ion-label class="ion-hide-lg-down">{{transfer.state | categoryName:transferStates}}</ion-label>
            </ion-item>
            @if(hasRole('resourceAdmin')) {
              <ion-item-options side="end">
                <ion-item-option color="danger" (click)="delete(slidingItem, transfer)">
                  <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                </ion-item-option>
                <ion-item-option color="primary" (click)="edit(slidingItem, transfer)">
                  <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                </ion-item-option>
              </ion-item-options>
            }
          </ion-item-sliding>
        }
      </ion-list>
    }
  </ion-content>
    `
})
export class TransferListComponent {
  protected readonly transferListStore = inject(TransferListStore);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredTransfers = computed(() => this.transferListStore.filteredTransfers() ?? []);
  protected transfersCount = computed(() => this.transferListStore.transfersCount());
  protected selectedTransfersCount = computed(() => this.filteredTransfers().length);
  protected isLoading = computed(() => this.transferListStore.isLoading());
  protected transferTags = computed(() => this.transferListStore.getTags());
  
  protected allTransferTypes = addAllCategory(TransferTypes);
  protected transferStates = TransferStates;
  protected allTransferStates = addAllCategory(TransferStates);
  protected years = getYearList();
  
  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.transferListStore.add(); break;
      case 'exportRaw': await this.transferListStore.export("raw"); break;
      default: error(undefined, `TransferListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async edit(slidingItem?: IonItemSliding, transfer?: TransferModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.transferListStore.edit(transfer);
  }

  public async delete(slidingItem?: IonItemSliding, transfer?: TransferModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.transferListStore.delete(transfer);
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.transferListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.transferListStore.setSelectedTag($event);
  }

  protected onStateChange(state: number): void {
    this.transferListStore.setSelectedState(state);
  }

  protected onYearChange(year: number): void {
    console.log('onYearChange', year);
    this.transferListStore.setSelectedYear(year);
  }

  protected onTypeChange(transferType: number): void {
    this.transferListStore.setSelectedType(transferType);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.transferListStore.currentUser());
  } 
}
