import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { GroupModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { fill, generateRandomString, hasRole } from '@okr/shared-util-core';

import { AvatarPipe, AvatarDisplay } from '@okr/avatar-ui';
import { Menu } from '@okr/cms-menu-feature';
import { MemberAvatarsPipe } from '@okr/relationship-membership-feature';
import { isAdminMember } from '@okr/subject-group-util';

import { GroupStore } from './group.store';

@Component({
  selector: 'okr-group-list',
  standalone: true,
  imports: [
    AsyncPipe, SvgIconPipe, AvatarPipe, MemberAvatarsPipe,
    Spinner, EmptyList, Menu, ListFilter, AvatarDisplay,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonPopover, IonAvatar, IonImg, IonList,
],
  providers: [GroupStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
  `],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title class="ion-hide-sm-down">{{ selectedGroupsCount()}}/{{groupsCount()}} {{ store.i18n.groups() }}</ion-title>
        <ion-title class="ion-hide-sm-up">{{ selectedGroupsCount()}} {{ store.i18n.groups() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="store.showInfo()">
            <ion-icon slot="icon-only" src="{{'info-circle' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
        @if(canCreate()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>

    <!-- search and filters -->
    <!-- search only: groups are few and untagged in practice, the tag filter was dead weight -->
    <okr-list-filter (searchTermChanged)="onSearchtermChange($event)" [mdSize]="6" />
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <okr-spinner />
    } @else {
      @if(selectedGroupsCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(group of filteredGroups(); track $index) {
            <ion-item (click)="showActions(group)">
              <ion-avatar slot="start">
                <ion-img src="{{ 'group.' + group.okey | avatar:group.icon }}" alt="Group Avatar Logo" />
              </ion-avatar>
              <ion-label>{{group.name}}</ion-label>
              <okr-avatar-display [avatars]="(group | memberAvatars | async) ?? []" [showName]="false" />
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class GroupList {
  protected readonly store = inject(GroupStore);
  private actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);

  // inputs
  public listId = input.required<string>();           // my, all, 
  public contextMenuName = input.required<string>();

  // derived signals
  protected filteredGroups = computed(() => {
    switch(this.listId()) {
      case 'my': return this.store.filteredMyGroups();
      case 'all': 
      default: return this.store.filteredGroups();
    }
  });
  protected groupsCount = computed(() => this.filteredGroups()?.length ?? 0);
  protected selectedGroupsCount = computed(() => this.filteredGroups().length);
  protected isLoading = computed(() => this.store.isLoading());
  private currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !this.canChange());
  protected popupId = computed(() => 'c_groups_' + generateRandomString(5));

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add': await this.store.add(!this.canCreate()); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: this.alertService.error(`GroupList.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Group. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param group 
   */
  protected async showActions(group: GroupModel): Promise<void> {
    const readOnly = this.readOnly() && !this.isGroupAdmin(group);
    if (readOnly) {
      await this.store.view(group, readOnly);
    } else {
      const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
      await this.addActionSheetButtons(actionSheetOptions, group);
      await this.executeActions(actionSheetOptions, group, readOnly);
    }
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param group 
   */
  private async addActionSheetButtons(actionSheetOptions: ActionSheetOptions, group: GroupModel): Promise<void> {
    actionSheetOptions.buttons.push(createActionSheetButton('as_show', this.store.i18n.show(), this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('as_edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    const isAdmin = hasRole('admin', this.store.appStore.currentUser());
    if (isAdmin || this.isGroupAdmin(group)) {
      actionSheetOptions.buttons.push(createActionSheetDivider());
      if (isAdmin && await this.store.doesGroupContentPageExist(group.okey) === false) {
        actionSheetOptions.buttons.push(createActionSheetButton('as_addPage', this.store.i18n.add_page(), this.imgixBaseUrl, 'add'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('as_delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param group 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, group: GroupModel, readOnly: boolean): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'as_delete':
          await this.store.delete(group, readOnly);
          break;
        case 'as_addPage':
          // tbd: add default article section explaining how to add content to the group page
          await this.store.createGroupPage(group, 'intro', fill(this.store.i18n.page_title(), { name: group.name }));
          break;
        case 'as_edit':
          await this.store.edit(group, readOnly);
          break;
        case 'as_view':
          await this.store.edit(group, true);
          break;
        case 'as_show':
          await this.store.view(group, readOnly);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  /** True if the current user is listed as an admin of this specific group. */
  private isGroupAdmin(group: GroupModel): boolean {
    return isAdminMember(group, this.currentUser()?.personKey);
  }

  /** Creating a group is restricted to privileged users (explained in GroupInfoModal). */
  protected canCreate = computed(() => hasRole('privileged', this.currentUser()));

  protected canChange(): boolean {
    if (hasRole('memberAdmin', this.currentUser())) return true;
    if (hasRole('privileged', this.currentUser())) return true;
    return false;
  }
}
