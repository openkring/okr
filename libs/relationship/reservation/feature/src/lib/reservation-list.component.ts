import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
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

import { ReservationStore } from './reservation.store';

@Component({
  selector: 'bk-reservation-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, DurationPipe, AvatarPipe,
    ListFilterComponent, EmptyListComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonAvatar, IonImg, IonList, IonPopover
  ],
  providers: [ReservationStore],
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
        (searchTermChanged)="searchTerm.set($event)"
        (tagChanged)="selectedTag.set($event)" [tags]="tags()"
        (typeChanged)="selectedReason.set($event)" [types]="reasons()"
        (stateChanged)="selectedState.set($event)" [states]="states()"
        (yearChanged)="selectedYear.set($event)"
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
              <ion-img src="{{ 'person.' + reservation.reserverKey | avatar:'reservation' | async }}" alt="Avatar Logo" />
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
  protected reservationStore = inject(ReservationStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.reservationStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.reservationStore.selectedTag());
  protected selectedReason = linkedSignal(() => this.reservationStore.selectedReason());
  protected selectedYear = linkedSignal(() => this.reservationStore.selectedYear());
  protected selectedState = linkedSignal(() => this.reservationStore.selectedState());

  // derived values
  protected filteredReservations = computed(() => this.reservationStore.filteredReservations());
  protected allReservations = computed(() => this.reservationStore.allReservations());
  protected reservationsCount = computed(() => this.reservationStore.allReservations()?.length ?? 0);
  protected selectedReservationsCount = computed(() => this.filteredReservations()?.length ?? 0);
  protected isLoading = computed(() => this.reservationStore.isLoading());
  protected tags = computed(() => this.reservationStore.getTags());
  protected reasons = computed(() => this.reservationStore.appStore.getCategory('reservation_reason'));
  protected states = computed(() => this.reservationStore.appStore.getCategory('reservation_state'));
  protected popupId = computed(() => 'c_reservation_' + this.listId());
  protected currentUser = computed(() => this.reservationStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  protected years = getYearList();
  private imgixBaseUrl = this.reservationStore.appStore.env.services.imgixBaseUrl;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.reservationStore.add(this.readOnly()); break;
      case 'exportRaw': await this.reservationStore.export("raw"); break;
      default: error(undefined, `ReservationComponent.call: unknown method ${selectedMethod}`);
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
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('reservation.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('reservation.edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(reservation.endDate)) {
        actionSheetOptions.buttons.push(createActionSheetButton('reservation.end', this.imgixBaseUrl, 'stop-circle'));
      }
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('reservation.delete', this.imgixBaseUrl, 'trash_delete'));
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
      if (!data) return;
      switch (data.action) {
        case 'reservation.delete':
          await this.reservationStore.delete(reservation, this.readOnly());
          break;
        case 'reservation.edit':
          await this.reservationStore.edit(reservation, this.readOnly());
          break;
        case 'reservation.view':
          await this.reservationStore.edit(reservation, true);
          break;
        case 'reservation.end':
          await this.reservationStore.end(reservation, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.reservationStore.currentUser());
  }

  protected isOngoing(reservation: ReservationModel): boolean {
    return isOngoing(reservation.endDate);
  }

  protected getReserverName(reservation: ReservationModel): string {
    return getReserverName(reservation);
  }
}
