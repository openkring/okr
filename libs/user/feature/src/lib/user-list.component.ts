import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

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
      IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonPopover
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
      [tags]="userTags()"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
     />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-grid>
        <ion-row>
          <ion-col size="6" size-lg="3">
            <ion-label><strong>Login Email</strong></ion-label>
          </ion-col>
          <ion-col size="6" size-lg="3">
            <ion-label><strong>Name</strong></ion-label>
          </ion-col>
        </ion-row>
      </ion-grid>
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

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredUsers = computed(() => this.userListStore.filteredUsers() ?? []);
  protected usersCount = computed(() => this.userListStore.usersCount());
  protected selectedUsersCount = computed(() => this.filteredUsers().length);
  protected isLoading = computed(() => this.userListStore.isLoading());
  protected userTags = computed(() => this.userListStore.getTags());
  protected popupId = computed(() => `c_user_${this.listId}`);

  protected isYearly = false;
  private imgixBaseUrl = this.userListStore.appStore.env.services.imgixBaseUrl;

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
    if (hasRole('admin', this.userListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
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
      switch (data.action) {
        case 'delete':
          await this.userListStore.delete(user);
          break;
        case 'edit':
          await this.userListStore.edit(user);
          break;
      }
    }
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.userListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.userListStore.setSelectedTag($event);
  }
  
  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.userListStore.currentUser());
  }
}
