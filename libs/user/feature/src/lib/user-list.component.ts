import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { MenuComponent } from '@bk2/cms-menu-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, UserModel } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { UserListStore } from './user-list.store';

@Component({
    selector: 'bk-user-list',
    standalone: true,
    imports: [
      TranslatePipe, AsyncPipe, SvgIconPipe, FullNamePipe,
      SpinnerComponent, EmptyListComponent, ListFilterComponent,
      MenuComponent,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
      IonLabel, IonContent, IonItem, IonList, IonPopover
    ],
    providers: [UserListStore],
    template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedUsersCount()}}/{{usersCount()}} {{ '@user.plural' | translate | async }}</ion-title>
        @if(hasRole('privileged')) {
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
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
     />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{ '@user.field.loginEmail' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@user.field.name' | translate | async }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- Data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      @if(filteredUsers().length === 0) {
        <bk-empty-list message="@user.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(user of filteredUsers(); track user.bkey) {
              <ion-item (click)="showActions(user)">
                <ion-label>{{user.loginEmail}}</ion-label>      
                <ion-label>{{user.firstName | fullName:user.lastName}}</ion-label>      
              </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class UserListComponent {
  protected userListStore = inject(UserListStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // derived signals
  protected searchTerm = linkedSignal(() => this.userListStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.userListStore.selectedTag());
  protected filteredUsers = computed(() => this.userListStore.filteredUsers() ?? []);
  protected usersCount = computed(() => this.userListStore.usersCount());
  protected selectedUsersCount = computed(() => this.filteredUsers().length);
  protected isLoading = computed(() => this.userListStore.isLoading());
  protected tags = computed(() => this.userListStore.getTags());
  protected popupId = computed(() => `c_user_${this.listId}`);
  protected currentUser = computed(() => this.userListStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('admin', this.currentUser()));

  // passing constants to the template
  protected isYearly = false;
  private imgixBaseUrl = this.userListStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.userListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.userListStore.setSelectedTag(tag);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.userListStore.add(); break;
      case 'exportRaw': await this.userListStore.export('raw'); break;
      default: error(undefined, `UserListComponent.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

   /**
   * Displays an ActionSheet with all possible actions on an User. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param user 
   */
  protected async showActions(user: UserModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, user);
    await this.executeActions(actionSheetOptions, user);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param user 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, user: UserModel): void {
    if (hasRole('privileged', this.userListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('user.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (hasRole('admin', this.userListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('user.edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('user.delete', this.imgixBaseUrl, 'trash_delete'));
    }
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param user 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, user: UserModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'user.delete':
          await this.userListStore.delete(user, this.readOnly());
          break;
        case 'user.edit':
          await this.userListStore.edit(user, this.readOnly());
          break;
        case 'user.view':
          await this.userListStore.edit(user, true);
          break;
      }
    }
  }
  
  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.userListStore.currentUser());
  }
}
