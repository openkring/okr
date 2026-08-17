import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { RoleName, InvitationModel } from '@okr/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { getItemLabel, getYearList, hasRole } from '@okr/shared-util-core';
import { TranslatePipe } from '@okr/shared-i18n';

import { Menu } from '@okr/cms-menu-feature';
import { AvatarDisplay } from '@okr/avatar-ui';

import { createPersonAvatar } from '@okr/relationship-invitation-util';
import { InvitationStore } from './invitation.store';

@Component({
  selector: 'okr-invitation-list',
  standalone: true,
  imports: [
    AsyncPipe, SvgIconPipe, PrettyDatePipe, TranslatePipe,
    EmptyList, ListFilter, AvatarDisplay, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonList, IonPopover
  ],
  providers: [InvitationStore],
  styles: `
    .sortable { cursor: pointer; user-select: none; }
    .sortable ion-icon { vertical-align: middle; font-size: 0.8rem; }
  `,
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ store.i18n.invitations() }}</ion-title>
      <ion-buttons slot="end">
        @if(hasRole('privileged') || hasRole('resourceAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="c-invitations">
              <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-invitations" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" [toggleStates]="{ togglePast: showPast() }"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>                  }
      </ion-buttons>
    </ion-toolbar>

    <!-- search and filters -->
    <okr-list-filter 
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)" [tags]="tags()"
        (stateChanged)="onStateSelected($event)" [states]="states()"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label class="sortable" (click)="sortBy('date')"><strong>{{ store.i18n.date() }}</strong>
          @if (sortCol() === 'date') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
        </ion-label>
        <ion-label class="ion-hide-md-down sortable" (click)="sortBy('name')"><strong>{{ store.i18n.name() }}</strong>
          @if (sortCol() === 'name') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
        </ion-label>
        <ion-label class="sortable" (click)="sortBy('invitee')"><strong>{{ store.i18n.invitee() }}</strong>
          @if (sortCol() === 'invitee') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
        </ion-label>
        <ion-label class="ion-hide-lg-down sortable" (click)="sortBy('inviter')"><strong>{{ store.i18n.inviter() }}</strong>
          @if (sortCol() === 'inviter') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
        </ion-label>
        <ion-label class="ion-hide-md-down sortable" (click)="sortBy('state')"><strong>{{ store.i18n.state() }}</strong>
          @if (sortCol() === 'state') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
        </ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(selectedInvitationsCount() === 0) {
      <okr-empty-list [message]="store.i18n.empty()" />
    } @else {
      <ion-list lines="inset">
        @for(invitation of filteredInvitations(); track $index) {
          <ion-item (click)="showActions(invitation)" detail="false">
            <ion-label >{{invitation.date | prettyDate}}</ion-label>
            <ion-label class="ion-hide-md-down">{{invitation.name}}</ion-label>
            <ion-label><okr-avatar-display [avatars]="[getAvatar(invitation.inviteeKey, invitation.inviteeFirstName, invitation.inviteeLastName)]" /></ion-label>
            <ion-label class="ion-hide-lg-down"><okr-avatar-display [avatars]="[getAvatar(invitation.inviterKey, invitation.inviterFirstName, invitation.inviterLastName)]" /></ion-label>
            <ion-label class="ion-hide-md-down">{{ stateLabel(invitation.state) | translate | async }}</ion-label>
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
  
  /** Whether past invitations are shown. Toggled via the context-menu 'togglePast' action. */
  protected showPast = signal(false);

  // sort state (default: newest date first, oldest at the bottom)
  protected sortCol = signal<'date' | 'name' | 'invitee' | 'inviter' | 'state'>('date');
  protected sortDir = signal<'asc' | 'desc'>('desc');

  // data
  protected filteredInvitations = computed(() => {
    const col = this.sortCol();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...(this.store.filteredInvitations() ?? [])].sort((a, b) => {
      const av = this.sortValue(a, col);
      const bv = this.sortValue(b, col);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  });
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
      const showOnlyCurrent = !this.showPast();
      if (this.listId() === 'my') {
        this.store.setScope('', this.currentUser()?.personKey ?? '', showOnlyCurrent);
      } else if (this.listId() === 'all') {
        this.store.setScope('', '', showOnlyCurrent);
      } else { // explicit calevent key given
        this.store.setScope(this.listId(), '', showOnlyCurrent);
      }
    })
  }

  /******************************** sorting ******************************************* */
  protected sortBy(col: 'date' | 'name' | 'invitee' | 'inviter' | 'state'): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set(col === 'date' ? 'desc' : 'asc');
    }
  }

  private sortValue(inv: InvitationModel, col: string): string {
    switch (col) {
      case 'invitee': return `${inv.inviteeLastName} ${inv.inviteeFirstName}`.toLowerCase();
      case 'inviter': return `${inv.inviterLastName} ${inv.inviterFirstName}`.toLowerCase();
      case 'name': return (inv.name ?? '').toLowerCase();
      case 'state': return (inv.state ?? '').toLowerCase();
      default: return inv.date ?? '';  // StoreDate yyyymmdd sorts lexicographically
    }
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
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch(selectedMethod) {
      case 'togglePast': this.showPast.update(v => !v); break;
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

  protected stateLabel(state: string): string {
    return getItemLabel(this.states(), state);
  }

  protected getAvatar(key: string, name1: string, name2: string) {
    return createPersonAvatar(key, name1, name2);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param invitation 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    // edit and view open the same modal — offer the one the user's permissions allow, never both
    if (this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('invitation.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton('invitation.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    }
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
          await this.store.delete(invitation, !this.hasRole('admin'));
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
