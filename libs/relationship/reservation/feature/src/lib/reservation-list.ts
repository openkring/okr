import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AvatarInfo, OrgModel, PersonModel, ReservationModel, ResourceModelName, RoleName } from '@bk2/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getAvatarKey, getAvatarName, getFullName, getYear, getYearList, hasRole, isOngoing, isPerson } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';
import { AvatarService } from '@bk2/avatar-data-access';

import { THUMBNAIL_SIZE } from '@bk2/shared-constants';

import { ReservationStore } from './reservation.store';


@Component({
  selector: 'bk-reservation-list',
  standalone: true,
  imports: [
    SvgIconPipe, PrettyDatePipe,
    ListFilter, EmptyList, Menu,
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
          {{ selectedReservationsCount()}} {{ title() }}
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
                <ion-label><strong>{{ store.i18n.resource_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.name_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.startDate_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3" class="ion-hide-md-down">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.state() }}</strong></ion-label>
              </ion-item>
            </ion-col>
          } @else if(isReservationOfResource() || isReservationOfResourceType()) {
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.reserver_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.name_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="4" size-md="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.startDate_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3" class="ion-hide-md-down">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.state() }}</strong></ion-label>
              </ion-item>
            </ion-col>
          } @else { <!-- all -->
            <ion-col size="auto" size-md="2"class="ion-hide-md-down">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.reserver_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="auto" size-md="2" class="ion-hide-md-down">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.resource_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3" class="ion-hide-md-up">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.reserver_label() }}</strong></ion-label>
                <ion-label><strong>{{ store.i18n.resource_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col>
              <ion-item lines="none" color="primary" class="ion-text-wrap">
                <ion-label><strong>{{ store.i18n.name_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="3">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.startDate_label() }}</strong></ion-label>
              </ion-item>
            </ion-col>
            <ion-col class="ion-hide-md-down">
              <ion-item lines="none" color="primary">
                <ion-label><strong>{{ store.i18n.state() }}</strong></ion-label>
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
      <bk-empty-list [message]="store.i18n.empty()" />
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
                  <ion-icon  src="{{getStateIcon(reservation.state) | svgIcon}}" />
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
                    <ion-icon  src="{{getStateIcon(reservation.state) | svgIcon}}" />
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
                  <ion-icon  src="{{getStateIcon(reservation.state) | svgIcon}}" />
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
export class ReservationList {
  protected store = inject(ReservationStore);
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
  
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      this.store.setListId(this.listId());
    });
  }

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedReason = linkedSignal(() => this.store.selectedReason());
  protected selectedYear = linkedSignal(() => this.store.selectedYear());
  protected selectedState = linkedSignal(() => this.store.selectedState());

  // derived values
  protected filteredReservations = computed(() => this.store.filteredReservations());
  protected allReservations = computed(() => this.store.allReservations());
  protected reservationsCount = computed(() => this.store.allReservations()?.length ?? 0);
  protected selectedReservationsCount = computed(() => this.filteredReservations()?.length ?? 0);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected reasons = computed(() => this.store.appStore.getCategory('reservation_reason'));
  protected states = computed(() => this.store.appStore.getCategory('reservation_state'));
  protected popupId = computed(() => 'c_reservation_' + this.listId());
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  protected readonly years = computed(() => getYearList(getYear() + 1, 7));
  protected title = computed(() => this.getTitle());
  protected resourceName = computed(() => this.store.currentResource()?.name);
  protected resourceKey = computed(() => this.store.currentResource()?.bkey ?? '');
  protected isReservationFromPerson = computed(() => this.listId().startsWith('p_') || this.listId() === 'my');
  protected isReservationFromOrg = computed(() => this.listId().startsWith('o_'));
  protected isReservationOfResource = computed(() => this.listId().startsWith('r_'));
  protected isReservationOfResourceType = computed(() => this.listId().startsWith('t_'));

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onReasonSelected(reason: string): void {
    this.store.setSelectedReason(reason);
  }

  protected onStateSelected(state: string): void {
    this.store.setSelectedState(state);
  }

  protected onYearSelected(year: number): void {
    this.store.setSelectedYear(year);
  }

  /******************************** getters ******************************************* */
  protected getStateIcon(state: string): string {
    return this.store.getStateIcon(state);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: error(undefined, `ReservationList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Reservation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param reservation 
   */
  protected async showActions(reservation: ReservationModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, reservation);
    await this.executeActions(actionSheetOptions, reservation);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param reservation 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, reservation: ReservationModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('reservation.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('reservation.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      if (isOngoing(reservation.endDate)) {
        actionSheetOptions.buttons.push(createActionSheetButton('reservation.end', this.store.i18n.end(), this.imgixBaseUrl, 'stop-circle'));
      }
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('reservation.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
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
          await this.store.delete(reservation, this.readOnly());
          break;
        case 'reservation.edit':
          await this.store.edit(reservation, this.readOnly());
          break;
        case 'reservation.view':
          await this.store.edit(reservation, true);
          break;
        case 'reservation.end':
          await this.store.end(reservation, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
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
        iconName = this.store.appStore.getCategoryIcon('rboat_type', avatar.subType) || 'rboat';
      } 
      // For other resources, use the resource type icon
      else if (avatar.type) {
        iconName = this.store.appStore.getCategoryIcon('resource_type', avatar.type) || avatar.type;
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
    if (this.listId() === 'all') return ' ' + this.store.i18n.reservations();
    const reserver = this.store.currentReserver();
    let reserverName = '';
    if (reserver) {
      if (isPerson(reserver, this.store.tenantId())) {
        const person = reserver as PersonModel;
        reserverName = getFullName(person.firstName, person.lastName, this.currentUser()?.nameDisplay) || '';
      } else {
        reserverName = (reserver as OrgModel).name || '';
      }
    }
    switch (this.listId().substring(0,2)) {
      case 't_': // resource type 
        return this.listId().substring(2) + ' ' + this.store.i18n.reservations();
      case 'r_': // resource key
        const resourceName = this.resourceName() ?? '';
        return `${resourceName} ${this.store.i18n.reservations()}`;
      case 'my': // my reservations = p_[currentUser.personKey]
      case 'p_': // reserver key (person)
        return `${reserverName} ${this.store.i18n.reservations()}`;
      case 'o_': // reserver key (org)
        return `${reserverName} ${this.store.i18n.reservations()}`;
      default:
        return '';
    }
  }
}
