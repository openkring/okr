import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular';

import { GroupModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner, ImgDirective } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { fill, hasRole, contextMenuId } from '@okr/shared-util-core';

import { AvatarPipe, AvatarDisplay } from '@okr/avatar-ui';
import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';
import { MemberAvatarsPipe } from '@okr/relationship-membership-feature';
import { isAdminMember, isNewsletterGroup } from '@okr/subject-group-util';

import { GroupChatSyncStore } from './group-chat-sync.store';
import { GroupStore } from './group.store';

@Component({
  selector: 'okr-group-list',
  standalone: true,
  imports: [
    ImgDirective, AsyncPipe, SvgIconPipe, AvatarPipe, MemberAvatarsPipe,
    Spinner, EmptyList, Menu, ListFilter, AvatarDisplay,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonPopover, IonAvatar, IonList, IonChip,
],
  providers: [GroupStore, GroupChatSyncStore],
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
            @if (menuItemsStore.canOpen(contextMenuName())) {
              <ion-button id="{{ popupId }}">
                <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
                <ng-template>
                  <ion-content>
                    <okr-menu [menuName]="contextMenuName()"/>
                  </ion-content>
                </ng-template>
              </ion-popover>
            }
          </ion-buttons>
        }
      </ion-toolbar>

    <!-- search and filters -->
    <!-- search only: groups are few and untagged in practice, the tag filter was dead weight -->
    <!-- the kind filter only appears once there is a newsletter the user may see (spec 1.169) -->
    <okr-list-filter (searchTermChanged)="onSearchtermChange($event)" [mdSize]="6"
      [strings]="kindFilter()" [stringLabels]="kindFilterLabels()" stringsName="kind" [stringsLabel]="store.i18n.kind_label()"
      [selectedString]="store.selectedKind()" (stringsChanged)="store.setSelectedKind($event)" />
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
                <img okrImg src="{{ 'group.' + group.okey | avatar:group.icon }}" alt="Group Avatar Logo" />
              </ion-avatar>
              <ion-label>{{group.name}}</ion-label>
              @if (isNewsletter(group)) {
                <!-- a newsletter has subscribers, not members -->
                <ion-chip slot="end" color="medium">{{ store.i18n.kind_newsletter() }}</ion-chip>
              } @else {
                <okr-avatar-display [avatars]="(group | memberAvatars | async) ?? []" [showName]="false" />
              }
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class GroupList {
  protected readonly menuItemsStore = inject(MenuItemsStore);
  protected readonly store = inject(GroupStore);
  private readonly chatSync = inject(GroupChatSyncStore);
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
  protected readonly popupId = contextMenuId('c_groups');
  protected readonly kindFilter = computed(() => this.store.hasNewsletters() ? ['all', 'group', 'newsletter'] : []);
  protected readonly kindFilterLabels = computed(() => [this.store.i18n.kind_all(), this.store.i18n.kind_group(), this.store.i18n.kind_newsletter()]);

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
      case 'checkHygiene': await this.store.checkHygiene(); break;
      case 'chatMembers': await this.chatSync.repairMembers(); break;
      case 'chatPostPolicy': await this.chatSync.syncPostPolicy(); break;
      case 'chatGuests': await this.chatSync.reviewGuests(); break;
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
    if (isNewsletterGroup(group)) {
      this.addNewsletterButtons(actionSheetOptions, group);
      return;
    }
    actionSheetOptions.buttons.push(createActionSheetButton('as_show', this.store.i18n.show(), this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('as_edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    const isAdmin = hasRole('admin', this.store.appStore.currentUser());
    if (isAdmin || this.isGroupAdmin(group)) {
      actionSheetOptions.buttons.push(createActionSheetDivider());
      if (isAdmin && await this.store.doesGroupContentPageExist(group.okey) === false) {
        actionSheetOptions.buttons.push(createActionSheetButton('as_addPage', this.store.i18n.add_page(), this.imgixBaseUrl, 'add'));
      }
      // spec 1.165 §7.4: a group admin or content admin decides whether the group page is the group's website page
      const contentPage = group.hasContent ? await this.store.readContentPage(group.okey) : undefined;
      if (contentPage && (isAdmin || hasRole('contentAdmin', this.store.appStore.currentUser()) || this.isGroupAdmin(group))) {
        actionSheetOptions.buttons.push(contentPage.isPrivate === false
          ? createActionSheetButton('as_hideWebsite', this.store.i18n.website_hide(), this.imgixBaseUrl, 'eye-off')
          : createActionSheetButton('as_showWebsite', this.store.i18n.website_show(), this.imgixBaseUrl, 'globe'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('as_delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  /**
   * A newsletter (spec 1.169): no group page, no content page, no members — its subscribers instead.
   * Only listed for member admins, privileged users and its own admins (`canSeeSubscribers`).
   */
  private addNewsletterButtons(actionSheetOptions: ActionSheetOptions, group: GroupModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('as_subscribers', this.store.i18n.subscribers(), this.imgixBaseUrl, 'persons'));
    actionSheetOptions.buttons.push(createActionSheetButton('as_edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    if (hasRole('admin', this.store.appStore.currentUser()) || this.isGroupAdmin(group)) {
      actionSheetOptions.buttons.push(createActionSheetDivider());
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
        case 'as_showWebsite':
          await this.store.showOnWebsite(group);
          break;
        case 'as_hideWebsite':
          await this.store.hideFromWebsite(group);
          break;
        case 'as_view':
          await this.store.edit(group, true);
          break;
        case 'as_show':
          await this.store.view(group, readOnly);
          break;
        case 'as_subscribers':
          await this.store.showSubscribers(group);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected isNewsletter(group: GroupModel): boolean {
    return isNewsletterGroup(group);
  }

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
