import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ReservationModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getYearList, hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';
import { getReserverName } from '@bk2/relationship-reservation-util';

import { ReservationListStore } from './reservation-list.store';

@Component({
  selector: 'bk-reservation-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, DurationPipe, AvatarPipe,
    ListFilterComponent, EmptyListComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonAvatar, IonImg, IonList, IonPopover
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
        [tags]="tags()" (tagChanged)="onTagSelected($event)"
        [type]="reasons()" (typeChanged)="onTypeSelected($event)"
        [years]="years" (yearChanged)="onYearSelected($event)"
        [state]="states()" (stateChanged)="onStateSelected($event)"
        (searchTermChanged)="onSearchtermChange($event)"
         />

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
          <ion-item (click)="showActions(reservation)">
            <ion-avatar slot="start">
              <ion-img src="{{ 'person.' + reservation.reserverKey | avatar | async }}" alt="Avatar Logo" />
            </ion-avatar>
            <ion-label>{{getReserverName(reservation)}}</ion-label>
            <ion-label>{{reservation.resourceName}}</ion-label>
            <ion-label>{{reservation.startDate | duration:reservation.endDate}}</ion-label>      
            <ion-label class="ion-hide-md-down">{{reservation.reservationState}}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  </ion-content>
    `
})
export class ReservationListComponent {
  protected reservationListStore = inject(ReservationListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredReservations = computed(() => this.reservationListStore.filteredReservations());
  protected allReservations = computed(() => this.reservationListStore.allReservations());
  protected reservationsCount = computed(() => this.reservationListStore.allReservations()?.length ?? 0);
  protected selectedReservationsCount = computed(() => this.filteredReservations()?.length ?? 0);
  protected isLoading = computed(() => this.reservationListStore.isLoading());
  protected tags = computed(() => this.reservationListStore.getTags());
  protected reasons = computed(() => this.reservationListStore.appStore.getCategory('reservation_reason'));
  protected states = computed(() => this.reservationListStore.appStore.getCategory('reservation_state'));
  protected popupId = computed(() => 'c_reservation_' + this.listId());

  protected years = getYearList();
  private imgixBaseUrl = this.reservationListStore.appStore.env.services.imgixBaseUrl;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.reservationListStore.add(); break;
      case 'exportRaw': await this.reservationListStore.export("raw"); break;
      default: error(undefined, `ReservationListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Reservation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param reservation 
   */
  protected async showActions(reservation: ReservationModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, reservation);
    await this.executeActions(actionSheetOptions, reservation);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param reservation 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, reservation: ReservationModel): void {
    if (hasRole('resourceAdmin', this.reservationListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(reservation.endDate)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endres', this.imgixBaseUrl, 'stop-circle'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (hasRole('admin', this.reservationListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param reservation 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, reservation: ReservationModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'delete':
          await this.reservationListStore.delete(reservation);
          break;
        case 'edit':
          await this.reservationListStore.edit(reservation);
          break;
        case 'endres':
          await this.reservationListStore.end(reservation);
          break;
      }
    }
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

  protected onTypeSelected(type: string): void {
    this.reservationListStore.setSelectedType(type);
  }

  protected onStateSelected(state: string): void {
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
