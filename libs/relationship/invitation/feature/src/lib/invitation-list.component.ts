import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, InvitationModel } from '@bk2/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getYearList, hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';
import { AvatarDisplayComponent } from '@bk2/avatar-ui';

import { InvitationStore } from './invitation.store';
import { createPersonAvatar } from '@bk2/relationship-invitation-util';

@Component({
  selector: 'bk-invitation-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PrettyDatePipe,
    EmptyListComponent, ListFilterComponent, AvatarDisplayComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonList, IonPopover
  ],
  providers: [InvitationStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedInvitationsCount()}}/{{invitationsCount()}} {{ '@invitation.plural' | translate | async }}</ion-title>
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
        <ion-label><strong>{{ '@invitation.list.header.date' | translate | async }}</strong></ion-label>
        <ion-label class="ion-hide-md-down"><strong>{{ '@invitation.list.header.name' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@invitation.list.header.invitee' | translate | async }}</strong></ion-label>
        <ion-label class="ion-hide-lg-down"><strong>{{ '@invitation.list.header.inviter' | translate | async }}</strong></ion-label>
        <ion-label class="ion-hide-md-down"><strong>{{ '@invitation.list.header.state' | translate | async }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(selectedInvitationsCount() === 0) {
      <bk-empty-list message="@invitation.field.empty" />
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
export class InvitationListComponent {
  protected readonly invitationStore = inject(InvitationStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>(); // my, all, or calevent key
  public contextMenuName = input.required<string>();
 // public showOnlyCurrent = input<boolean>(true);

  // filters
  protected searchTerm = linkedSignal(() => this.invitationStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.invitationStore.selectedTag());
  protected selectedState = linkedSignal(() => this.invitationStore.selectedState());
  
  // data
  protected filteredInvitations = computed(() => this.invitationStore.filteredInvitations() ?? []);
  protected invitationsCount = computed(() => this.invitationStore.invitationsCount());
  protected selectedInvitationsCount = computed(() => this.filteredInvitations().length);
  protected isLoading = computed(() => this.invitationStore.isLoading());
  protected tags = computed(() => this.invitationStore.getTags());
  protected states = computed(() => this.invitationStore.appStore.getCategory('invitation_state'));
  protected currentUser = computed(() => this.invitationStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  protected years = getYearList();
  private imgixBaseUrl = this.invitationStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      console.log(`InvitationListComponent: setting scope for listId=${this.listId()}`);  
      if (this.listId() === 'my') {
        this.invitationStore.setScope('', this.currentUser()?.personKey ?? '', true);
      } else if (this.listId() === 'all') {
        this.invitationStore.setScope('', '', true);
      } else { // explicit calevent key given
        this.invitationStore.setScope(this.listId(), '', true);
      }
    })
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.invitationStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.invitationStore.setSelectedTag(tag);
  }

  protected onStateSelected(state: string): void {
    this.invitationStore.setSelectedState(state);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'exportRaw': await this.invitationStore.export("raw"); break;
      default: error(undefined, `InvitationListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Invitation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param invitation 
   */
  protected async showActions(invitation: InvitationModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
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
      actionSheetOptions.buttons.push(createActionSheetButton('invitation.edit', this.imgixBaseUrl, 'create_edit'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('invitation.view', this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (hasRole('admin', this.invitationStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('invitation.delete', this.imgixBaseUrl, 'trash_delete'));
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
          await this.invitationStore.delete(invitation, this.readOnly());
          break;
        case 'invitation.edit':
          await this.invitationStore.edit(invitation, this.readOnly());
          break;
        case 'invitation.view':
          await this.invitationStore.edit(invitation, true);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.invitationStore.currentUser());
  } 
}
