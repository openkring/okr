import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { addAllCategory, ReservationStates, ResourceTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, ReservationModel, RoleName } from '@bk2/shared-models';
import { CategoryNamePipe, DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent } from '@bk2/shared-ui';
import { error } from '@bk2/shared-util-angular';
import { getYearList, hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';
import { getReserverName } from '@bk2/relationship-reservation-util';

import { ReservationListStore } from './reservation-list.store';

@Component({
  selector: 'bk-reservation-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, DurationPipe, AvatarPipe, CategoryNamePipe,
    ListFilterComponent, EmptyListComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
    IonLabel, IonContent, IonItem, IonItemOptions, IonItemOption, IonAvatar, IonImg, IonList,
    IonPopover
  ],
  providers: [ReservationListStore],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedReservationsCount()}}/{{reservationsCount()}} {{ '@reservation.list.title' | translate | async }}</ion-title>
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
        [tags]="reservationTags()"
        [types]="resourceTypes"
        typeName="resourceType"
        [years]="years"
        [states]="allReservationStates"
        stateName="reservationState"
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)"
        (typeChanged)="onTypeSelected($event)"
        (stateChanged)="onStateSelected($event)"
        (yearChanged)="onYearSelected($event)" />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{'@reservation.list.header.name' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@reservation.list.header.resource' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@reservation.list.header.duration' | translate | async}}</strong></ion-label>
        <ion-label class="ion-hide-md-down"><strong>{{'@reservation.list.header.category' | translate | async}}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(selectedReservationsCount() === 0) {
      <bk-empty-list message="@reservation.field.empty" />
    } @else {
      <ion-list lines="inset">
        @for(reservation of filteredReservations(); track $index) {
          <ion-item-sliding #slidingItem>
            <ion-item (click)="edit(undefined, reservation)">
              <ion-avatar slot="start">
                <ion-img src="{{ modelType.Person + '.' + reservation.reserverKey | avatar | async }}" alt="Avatar Logo" />
              </ion-avatar>
              <ion-label>{{getReserverName(reservation)}}</ion-label>
              <ion-label>{{reservation.resourceName}}</ion-label>
              <ion-label>{{reservation.startDate | duration:reservation.endDate}}</ion-label>      
              <ion-label class="ion-hide-md-down">{{reservation.reservationState|categoryName:reservationStates}}</ion-label>
            </ion-item>
            @if(hasRole('resourceAdmin')) {
              <ion-item-options side="end">
                <ion-item-option color="danger" (click)="delete(slidingItem, reservation)">
                  <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                </ion-item-option>
                @if(isOngoing(reservation)) {
                  <ion-item-option color="warning" (click)="end(slidingItem, reservation)">
                    <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                  </ion-item-option>
                }
                <ion-item-option color="primary" (click)="edit(slidingItem, reservation)">
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
export class ReservationListComponent {
  protected reservationListStore = inject(ReservationListStore);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredReservations = computed(() => this.reservationListStore.filteredReservations());
  protected allReservations = computed(() => this.reservationListStore.allReservations());
  protected reservationsCount = computed(() => this.reservationListStore.allReservations()?.length ?? 0);
  protected selectedReservationsCount = computed(() => this.filteredReservations()?.length ?? 0);
  protected isLoading = computed(() => this.reservationListStore.isLoading());
  protected reservationTags = computed(() => this.reservationListStore.getTags());
  protected popupId = computed(() => 'c_reservation_' + this.listId());

  protected reservationStates = ReservationStates;
  protected allReservationStates = addAllCategory(ReservationStates);
  protected resourceTypes = addAllCategory(ResourceTypes);
  protected modelType = ModelType;
  protected years = getYearList();

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch (_selectedMethod) {
      case 'add': await this.reservationListStore.add(); break;
      case 'exportRaw': await this.reservationListStore.export("raw"); break;
      default: error(undefined, `ReservationListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async edit(slidingItem?: IonItemSliding, reservation?: ReservationModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.reservationListStore.edit(reservation);
  }

  public async delete(slidingItem?: IonItemSliding, reservation?: ReservationModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.reservationListStore.delete(reservation);
  }

  public async end(slidingItem?: IonItemSliding, reservation?: ReservationModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.reservationListStore.end(reservation);
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.reservationListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.reservationListStore.setSelectedTag(tag);
  }

  protected onYearSelected(year: number): void {
    this.reservationListStore.setSelectedYear(year);
  }

  protected onTypeSelected(type: number): void {
    this.reservationListStore.setSelectedType(type);
  }

  protected onStateSelected(state: number): void {
    this.reservationListStore.setSelectedState(state);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.reservationListStore.currentUser());
  }

  protected isOngoing(reservation: ReservationModel): boolean {
    return isOngoing(reservation.endDate);
  }

  protected getReserverName(reservation: ReservationModel): string {
    return getReserverName(reservation);
  }
}
