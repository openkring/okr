import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { RoleName, InvitationModel } from '@bk2/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getYearList, hasRole } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';
import { AvatarDisplay } from '@bk2/avatar-ui';

import { createPersonAvatar } from '@bk2/relationship-invitation-util';
import { InvitationStore } from './invitation.store';

@Component({
  selector: 'bk-invitation-list',
  standalone: true,
  imports: [
    SvgIconPipe, PrettyDatePipe,
    EmptyList, ListFilter, AvatarDisplay, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonList, IonPopover
  ],
  providers: [InvitationStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedInvitationsCount()}}/{{invitationsCount()}} {{ store.i18n.invitations() }}</ion-title>
      <ion-buttons slot="end">
        @if(hasRole('privileged') || hasRole('resourceAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="c-invitations">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-invitations" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)" [tags]="tags()"
        (stateChanged)="onStateSelected($event)" [states]="states()"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{ store.i18n.date() }}</strong></ion-label>
        <ion-label class="ion-hide-md-down"><strong>{{ store.i18n.name() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.invitee() }}</strong></ion-label>
        <ion-label class="ion-hide-lg-down"><strong>{{ store.i18n.inviter() }}</strong></ion-label>
        <ion-label class="ion-hide-md-down"><strong>{{ store.i18n.state() }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(selectedInvitationsCount() === 0) {
      <bk-empty-list [message]="store.i18n.empty()" />
    } @else {
      <ion-list lines="inset">
        @for(invitation of filteredInvitations(); track $index) {
          <ion-item (click)="showActions(invitation)" detail="false">
            <ion-label >{{invitation.date | prettyDate}}</ion-label>
            <ion-label class="ion-hide-md-down">{{invitation.name}}</ion-label>
            <ion-label><bk-avatar-display [avatars]="[getAvatar(invitation.inviteeKey, invitation.inviteeFirstName, invitation.inviteeLastName)]" /></ion-label>
            <ion-label class="ion-hide-lg-down"><bk-avatar-display [avatars]="[getAvatar(invitation.inviterKey, invitation.inviterFirstName, invitation.inviterLastName)]" /></ion-label>
            <ion-label class="ion-hide-md-down">{{invitation.state}}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  </ion-content>
    `
})
export class InvitationList {
  protected readonly store = inject(InvitationStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>(); // my, all, or calevent key
  public contextMenuName = input.required<string>();
 // public showOnlyCurrent = input<boolean>(true);

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedState = linkedSignal(() => this.store.selectedState());
  
  // data
  protected filteredInvitations = computed(() => this.store.filteredInvitations() ?? []);
  protected invitationsCount = computed(() => this.store.invitationsCount());
  protected selectedInvitationsCount = computed(() => this.filteredInvitations().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected states = computed(() => this.store.appStore.getCategory('invitation_state'));
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  protected years = getYearList();
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      if (this.listId() === 'my') {
        this.store.setScope('', this.currentUser()?.personKey ?? '', true);
      } else if (this.listId() === 'all') {
        this.store.setScope('', '', true);
      } else { // explicit calevent key given
        this.store.setScope(this.listId(), '', true);
      }
    })
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onStateSelected(state: string): void {
    this.store.setSelectedState(state);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'exportRaw': await this.store.export("raw"); break;
      default: error(undefined, `InvitationList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Invitation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param invitation 
   */
  protected async showActions(invitation: InvitationModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions);
    await this.executeActions(actionSheetOptions, invitation);
  }

  protected getAvatar(key: string, name1: string, name2: string) {
    return createPersonAvatar(key, name1, name2);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param invitation 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('invitation.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('invitation.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (hasRole('admin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('invitation.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param invitation 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, invitation: InvitationModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'invitation.delete':
          await this.store.delete(invitation, this.readOnly());
          break;
        case 'invitation.edit':
          await this.store.edit(invitation, this.readOnly());
          break;
        case 'invitation.view':
          await this.store.edit(invitation, true);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  } 
}
