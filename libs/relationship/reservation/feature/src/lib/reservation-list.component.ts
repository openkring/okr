import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo, OrgModel, PersonModel, ReservationModel, ResourceModelName, RoleName } from '@bk2/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getAvatarKey, getAvatarName, getFullName, getYear, getYearList, hasRole, isOngoing, isPerson } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';
import { AvatarService } from '@bk2/avatar-data-access';

import { ReservationStore } from './reservation.store';
import { THUMBNAIL_SIZE } from '@bk2/shared-constants';

@Component({
  selector: 'bk-reservation-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PrettyDatePipe,
    ListFilterComponent, EmptyListComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonAvatar, IonImg, IonPopover,
    IonGrid, IonRow, IonCol
  ],
  providers: [ReservationStore],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title class="ion-hide-md-down">
          {{ selectedReservationsCount()}}/{{reservationsCount()}} {{ title() }}
        </ion-title>
        <ion-title class="ion-hide-md-up">
          {{ selectedReservationsCount()}}/{{reservationsCount()}} {{ title() }}
        </ion-title>
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
      <bk-list-filter class="ion-hide-md-down"
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)" [tags]="tags()"
        (typeChanged)="onReasonSelected($event)" [types]="reasons()"
        (stateChanged)="onStateSelected($event)" [states]="states()"
        (yearChanged)="onYearSelected($event)" [years]="years()"
      />
      <bk-list-filter class="ion-hide-md-up"
        (searchTermChanged)="onSearchtermChange($event)"
        (yearChanged)="onYearSelected($event)" [years]="years()"
      />
    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-grid>
        <ion-row>
          @if(isReservationFromPerson() || isReservationFromOrg()) {
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.resource' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.name' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.validFrom' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3" class="ion-hide-md-down">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.state' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
          } @else if(isReservationOfResource() || isReservationOfResourceType()) {
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.reserver' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.name' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.validFrom' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3" class="ion-hide-md-down">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.state' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-item lines="none" color="primary">
            </ion-item>
          } @else { <!-- all -->
            <ion-col size="auto" size-md="2"class="ion-hide-md-down">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.reserver' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="auto" size-md="2" class="ion-hide-md-down">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.resource' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3" class="ion-hide-md-up">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.reserver' | translate | async}}</strong></ion-label>
                <ion-label><strong>{{'@reservation.list.header.resource' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col>
              <ion-item lines="none" color="primary" class="ion-text-wrap">
                <ion-label><strong>{{'@reservation.list.header.name' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.validFrom' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col class="ion-hide-md-down">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{'@reservation.list.header.state' | translate | async}}</strong></ion-label>
              </ion-item>
            </ion-col>
          }
        </ion-row>
      </ion-grid>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(selectedReservationsCount() === 0) {
      <bk-empty-list message="@reservation.field.empty" />
    } @else {
      <ion-grid>
        @for(reservation of filteredReservations(); track $index) {
          <ion-row (click)="showActions(reservation)">
            @if(isReservationFromPerson() || isReservationFromOrg()) {
              <ion-col size="3">
                <ion-item lines="none">
                  <ion-avatar slot="start" style="width: 32px; height: 32px;"><ion-img [src]="getAvatarUrl(reservation, 'resource')" alt="Avatar Logo" /></ion-avatar>
                  <ion-label class="ion-hide-md-down">{{reservation.resource?.name2}}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="5" size-md="3">
                <ion-item lines="none" class="ion-text-wrap">
                  <ion-label>{{reservation.name}}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="4" size-md="3">
                <ion-item lines="none">
                  <ion-label>{{reservation.startDate | prettyDate }}</ion-label>      
                </ion-item>
              </ion-col>
              <ion-col size="3" class="ion-hide-md-down">
                <ion-item lines="none">
                  <ion-label>{{reservation.state}}</ion-label>
                </ion-item>
              </ion-col>
            } @else if(isReservationOfResource() || isReservationOfResourceType()) {
                <ion-col size="3">
                  <ion-item lines="none">
                    <ion-avatar slot="start" style="width: 32px; height: 32px;"><ion-img [src]="getAvatarUrl(reservation, 'reserver')" alt="Avatar Logo" /></ion-avatar>
                    <ion-label class="ion-hide-md-down">{{getReserverName(reservation)}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="5" size-md="3">
                  <ion-item lines="none" class="ion-text-wrap">
                    <ion-label>{{reservation.name}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="4" size-md="3">
                  <ion-item lines="none">
                    <ion-label>{{reservation.startDate | prettyDate }}</ion-label>      
                  </ion-item>
                </ion-col>
                <ion-col size="3" class="ion-hide-md-down">
                  <ion-item lines="none">
                    <ion-label>{{reservation.state}}</ion-label>
                  </ion-item>
                </ion-col>
            } @else { <!-- all --> 
              <ion-col size="3" class="ion-hide-md-down">
                <ion-item lines="none">
                  <ion-avatar slot="start"style="width: 32px; height: 32px;"><ion-img [src]="getAvatarUrl(reservation, 'reserver')" alt="Reserver Avatar" /></ion-avatar>
                  <ion-label>{{getReserverName(reservation)}}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="auto" class="ion-hide-md-up">
                  <ion-avatar style="width: 32px; height: 32px;"><ion-img [src]="getAvatarUrl(reservation, 'reserver')" alt="Reserver Avatar" /></ion-avatar>
              </ion-col>
              <ion-col class="ion-hide-md-down">
                <ion-item lines="none">
                  <ion-avatar slot="start" style="width: 32px; height: 32px;"><ion-img [src]="getAvatarUrl(reservation, 'resource')" alt="Resource Avatar" /></ion-avatar>
                  <ion-label>{{getResourceName(reservation)}}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="auto" class="ion-hide-md-up">
                  <ion-avatar style="width: 32px; height: 32px;"><ion-img [src]="getAvatarUrl(reservation, 'resource')" alt="Resource Avatar" /></ion-avatar>
              </ion-col>
              <ion-col>
                <ion-item lines="none"  class="ion-text-wrap">
                  <ion-label>{{reservation.name}}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="auto">
                <ion-item lines="none">
                  <ion-label>{{reservation.startDate | prettyDate }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col class="ion-hide-md-down">
                <ion-item lines="none">
                  <ion-label>{{reservation.state}}</ion-label>
                </ion-item>
              </ion-col>
            }
          </ion-row>
        }
      </ion-grid>
    }
  </ion-content>
    `
})
export class ReservationListComponent {
  protected reservationStore = inject(ReservationStore);
  private actionSheetController = inject(ActionSheetController);
  private avatarService = inject(AvatarService);

  // inputs
  // listIds: t_resourceType, r_resourceKey, p_reserverKey, all
  /**
   * A list filter that defines which reservations to show in the list:
   * - all: all reservations
   * - my: all reservations of the current user (sames as p_{{currentUser.personKey}})
   * - t_resourceType: all reservations for resources of the given type
   * - r_resourceKey: all reservations for the given resource
   * - p_reserverKey: all reservations of the given reserver (person)
   * - o_reserverKey: all reservations of the given reserver (org)
   * 
   * Examples:
   * - for Bootshaus reservations: r_test_default
   * - for boat reservations: t_rboat
   * - for my reservations: p_{{currentUser.personKey}}
   */
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();
  
  private imgixBaseUrl = this.reservationStore.appStore.env.services.imgixBaseUrl;

  // Track which avatar storagePaths have been loaded (triggers re-render when loaded)
  protected avatarUrls = signal(new Map<string, boolean>());

  constructor() {
    effect(() => {
      this.reservationStore.setListId(this.listId());
    });
  }

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
  protected readonly years = computed(() => getYearList(getYear() + 1, 7));
  protected title = computed(() => this.getTitle());
  protected resourceName = computed(() => this.reservationStore.currentResource()?.name);
  protected resourceKey = computed(() => this.reservationStore.currentResource()?.bkey ?? '');
  protected isReservationFromPerson = computed(() => this.listId().startsWith('p_') || this.listId() === 'my');
  protected isReservationFromOrg = computed(() => this.listId().startsWith('o_'));
  protected isReservationOfResource = computed(() => this.listId().startsWith('r_'));
  protected isReservationOfResourceType = computed(() => this.listId().startsWith('t_'));

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.reservationStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.reservationStore.setSelectedTag(tag);
  }

  protected onReasonSelected(reason: string): void {
    this.reservationStore.setSelectedReason(reason);
  }

  protected onStateSelected(state: string): void {
    this.reservationStore.setSelectedState(state);
  }

  protected onYearSelected(year: number): void {
    this.reservationStore.setSelectedYear(year);
  }

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
    const avatar = reservation.reserver;
    return avatar ? getAvatarName(avatar, this.currentUser()?.nameDisplay) : '';
  }

  protected getResourceName(reservation: ReservationModel): string {
    return reservation.resource?.name2 || reservation.resource?.label || '';
  }

  /**
   * Get the default icon name for an avatar based on its type
   */
  private getDefaultIconName(avatar: AvatarInfo): string {
    let iconName = avatar.modelType as string;
    
    if (avatar.modelType === ResourceModelName) {
      // For rboat resources, use the subType icon (e.g., b1x, b2x, etc.)
      if (avatar.type === 'rboat' && avatar.subType) {
        iconName = this.reservationStore.appStore.getCategoryIcon('rboat_type', avatar.subType) || 'rboat';
      } 
      // For other resources, use the resource type icon
      else if (avatar.type) {
        iconName = this.reservationStore.appStore.getCategoryIcon('resource_type', avatar.type) || avatar.type;
      }
    }
    
    return iconName;
  }

  /**
   * Get the avatar URL for a reserver or resource.
   * Returns the URL synchronously using cached storagePath from AvatarService.
   */
  protected getAvatarUrl(reservation: ReservationModel, type: 'reserver' | 'resource'): string {
    const avatar = type === 'reserver' ? reservation.reserver : reservation.resource;
    
    // Return default icon if no avatar info
    if (!avatar) return `${this.imgixBaseUrl}/logo/icons/person.svg`;
    
    const avatarKey = getAvatarKey(
      avatar.modelType,
      avatar.key,
      avatar.type,
      avatar.subType
    );
    
    const defaultIcon = this.getDefaultIconName(avatar);
    
    // Use AvatarService's synchronous method (uses cached storagePath)
    return this.avatarService.getAvatarUrl(avatarKey, defaultIcon, THUMBNAIL_SIZE);
  }

  protected getTitle(): string {
    if (this.listId() === 'all') return ' Reservationen';
    const reserver = this.reservationStore.currentReserver();
    let reserverName = '';
    if (reserver) {
      if (isPerson(reserver, this.reservationStore.tenantId())) {
        const person = reserver as PersonModel;
        reserverName = getFullName(person.firstName, person.lastName, this.currentUser()?.nameDisplay) || '';
      } else {
        reserverName = (reserver as OrgModel).name || '';
      }
    }
    switch (this.listId().substring(0,2)) {
      case 't_': // resource type 
        return this.listId().substring(2) + ' Reservationen';
      case 'r_': // resource key
        const resourceName = this.resourceName() ?? '';
        return `${resourceName} Reservationen`;
      case 'my': // my reservations = p_[currentUser.personKey]
      case 'p_': // reserver key (person)
        return `${reserverName} Reservationen`;
      case 'o_': // reserver key (org)
        return `${reserverName} Reservationen`;
      default:
        return '';
    }
  }
}
