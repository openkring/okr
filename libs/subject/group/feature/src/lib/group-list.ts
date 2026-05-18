import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { GroupModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@bk2/shared-util-angular';
import { generateRandomString, hasRole } from '@bk2/shared-util-core';

import { AvatarPipe, AvatarDisplay } from '@bk2/avatar-ui';
import { Menu } from '@bk2/cms-menu-feature';
import { MemberAvatarsPipe } from '@bk2/relationship-membership-feature';

import { GroupStore } from './group.store';

@Component({
  selector: 'bk-group-list',
  standalone: true,
  imports: [
    AsyncPipe, SvgIconPipe, AvatarPipe, MemberAvatarsPipe,
    Spinner, EmptyList, Menu, ListFilter, AvatarDisplay,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonPopover, IonAvatar, IonImg, IonList,
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
        <ion-title>{{ selectedGroupsCount()}}/{{groupsCount()}} {{ store.i18n.group_plural() }}</ion-title>
        @if(hasRole('privileged') || hasRole('memberAdmin')) {
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
        <ion-grid>
          <ion-row>
            <ion-col>
              <ion-label><strong>{{ store.i18n.list_header_name() }}</strong></ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      @if(selectedGroupsCount() === 0) {
        <bk-empty-list message="@subject.group.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(group of filteredGroups(); track $index) {
            <ion-item (click)="showActions(group)">
              <ion-avatar slot="start">
                <ion-img src="{{ 'group.' + group.bkey | avatar:group.icon }}" alt="Group Avatar Logo" />
              </ion-avatar>
              <ion-label>{{group.name}}</ion-label>
              <bk-avatar-display [avatars]="(group | memberAvatars | async) ?? []" [showName]="false" />
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
      case 'my': return this.store.myAccessibleGroups();
      case 'all': 
      default: return this.store.filteredGroups();
    }
  });
  protected groupsCount = computed(() => this.filteredGroups()?.length ?? 0);
  protected selectedGroupsCount = computed(() => this.filteredGroups().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  private currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !this.canChange());
  protected popupId = computed(() => 'c_groups_' + generateRandomString(5));

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.store.add(this.readOnly()); break;
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
    if (this.readOnly()) {
      await this.store.view(group, this.readOnly());
    } else {
      const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      await this.addActionSheetButtons(actionSheetOptions, group);
      await this.executeActions(actionSheetOptions, group);
    }
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param group 
   */
  private async addActionSheetButtons(actionSheetOptions: ActionSheetOptions, group: GroupModel): Promise<void> {
    actionSheetOptions.buttons.push(createActionSheetButton('group.show', this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('group.edit', this.imgixBaseUrl, 'edit'));
    if (hasRole('admin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetDivider());
      if (await this.store.doesGroupContentPageExist(group.bkey) === false) {
        actionSheetOptions.buttons.push(createActionSheetButton('group.addPage', this.imgixBaseUrl, 'add'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('group.delete', this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param group 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, group: GroupModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'group.delete':
          await this.store.delete(group, this.readOnly());
          break;
        case 'group.addPage':
          // tbd: add default article section explaining how to add content to the group page
          await this.store.createGroupPage(group, 'intro', 'Gruppe: ' + group.name);
          break;
        case 'group.edit':
          await this.store.edit(group, this.readOnly());
          break;
        case 'group.view':
          await this.store.edit(group, true);
          break;
        case 'group.show':
          await this.store.view(group, this.readOnly());
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected canChange(): boolean {
    if (hasRole('memberAdmin', this.currentUser())) return true;
    if (hasRole('privileged', this.currentUser())) return true;
    return false;
  }
}
