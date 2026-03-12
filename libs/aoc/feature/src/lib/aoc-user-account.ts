import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar, ToastController } from '@ionic/angular/standalone';

import { MenuComponent } from '@bk2/cms-menu-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { copyToClipboardWithConfirmation, createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { generateRandomString, hasRole } from '@bk2/shared-util-core';
import { AocUserAccountStore, UserAccount } from './aoc-user-account.store';


@Component({
    selector: 'bk-aoc-user-accounts',
    standalone: true,
    imports: [
      TranslatePipe, AsyncPipe, SvgIconPipe, FullNamePipe,
      SpinnerComponent, EmptyListComponent, ListFilterComponent,
      MenuComponent,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
      IonLabel, IonContent, IonItem, IonList, IonPopover
    ],
    providers: [AocUserAccountStore],
    template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount()}}/{{accountsCount()}} {{ '@account.plural' | translate | async }}</ion-title>
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
     />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label>X X X</ion-label>
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
      @if(filteredAccounts().length === 0) {
        <bk-empty-list message="@user.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(account of filteredAccounts(); track $index) {
            <!-- tbd: add XXX -->
              <ion-item (click)="showActions(account)">
                <ion-label>
                  {{account.hasFirebaseAccount ? 'X' : '-'}}     
                  {{account.hasBkAccount ? 'X' : '-'}}     
                  {{account.hasMembership ? 'X' : '-'}}
                </ion-label>      
                <ion-label>{{account.loginEmail}}</ion-label>      
                <ion-label>{{account.firstName | fullName:account.lastName}}</ion-label>
                <!-- tbd: add personKey, uid -->    
              </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class AocUserAccounts {
  protected store = inject(AocUserAccountStore);
  private actionSheetController = inject(ActionSheetController);
  private toastController = inject(ToastController);

  // inputs
  public contextMenuName = input.required<string>();

  // derived signals
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected accounts = computed(() => this.store.userAccounts() ?? []);
  protected accountsCount = computed(() => this.accounts().length);
  protected filteredAccounts = computed(() => this.store.filteredAccounts());
  protected filteredCount = computed(() => this.filteredAccounts().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected popupId = computed(() => `c_accounts_${generateRandomString(5)}`);
  protected currentUser = computed(() => this.store.currentUser());

  // passing constants to the template
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
/*     const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(); break;
      case 'exportRaw': await this.store.export('raw'); break;
      case 'exportUsers': await this.store.export('users'); break;
      default: error(undefined, `UserListComponent.onPopoverDismiss: unknown method ${selectedMethod}`);
    } */
  }

   /**
   * Displays an ActionSheet with all possible actions on an UserAccount.
   * After user selected an action this action is executed.
   * @param account 
   */
  protected async showActions(account: UserAccount): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, account);
    await this.executeActions(actionSheetOptions, account);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param account 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, account: UserAccount): void {
    if (account.hasFirebaseAccount) {
      actionSheetOptions.buttons.push(createActionSheetButton('fbuser.delete', this.imgixBaseUrl, 'trash_delete'));
    }
    if (account.hasBkAccount) {
      actionSheetOptions.buttons.push(createActionSheetButton('user.edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('user.delete', this.imgixBaseUrl, 'trash_delete'));
    }
    if (account.hasMembership) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (account.loginEmail) {
      actionSheetOptions.buttons.push(createActionSheetButton('account.copyemail', this.imgixBaseUrl, 'copy'));
    }
    if (account.uid) {
      actionSheetOptions.buttons.push(createActionSheetButton('account.copyuid', this.imgixBaseUrl, 'copy'));
    }
    if (account.personKey) {
      actionSheetOptions.buttons.push(createActionSheetButton('account.copypkey', this.imgixBaseUrl, 'copy'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param account 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, account: UserAccount): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'fbuser.delete':
          await this.store.deleteFirebaseUser(account);
          break;
        case 'user.edit':
          await this.store.editUser(account);
          break;
        case 'user.delete':
          await this.store.deleteUser(account);
          break;
        case 'membership.edit':
          await this.store.editMembership(account);
          break;
        case 'account.copyemail':
          await copyToClipboardWithConfirmation(this.toastController, account.loginEmail, 'Copied successfully');
          break;
        case 'account.copyuid':
          await copyToClipboardWithConfirmation(this.toastController, account.uid, 'Copied successfully');
          break;
        case 'account.copypkey':
          await copyToClipboardWithConfirmation(this.toastController, account.personKey, 'Copied successfully');
          break;
      }
    }
  }
  
  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
