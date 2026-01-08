import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { GroupStore } from './group.store';

@Component({
  selector: 'bk-group-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe,
    SpinnerComponent, EmptyListComponent,
    MenuComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonPopover,
    IonAvatar, IonImg, IonList
  ],
  providers: [GroupStore],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedGroupsCount()}}/{{groupsCount()}} {{ '@subject.group.plural' | translate | async }}</ion-title>
        <ion-buttons slot="end">
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
            <ion-buttons slot="end">
              <ion-button id="c-groups">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="c-groups" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
                <ng-template>
                  <ion-content>
                    <bk-menu [menuName]="contextMenuName()"/>
                  </ion-content>
                </ng-template>
              </ion-popover>
            </ion-buttons>          }
          </ion-buttons>
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
              <ion-label><strong>{{ '@subject.list.header.name' | translate | async }}</strong></ion-label>
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
                <ion-img src="{{ 'group.' + group.bkey | avatar | async }}" alt="Avatar Logo" />
              </ion-avatar>
              <ion-label>{{group.name}}</ion-label>      
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class GroupListComponent {
  protected readonly groupStore = inject(GroupStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filter
  protected searchTerm = linkedSignal(() => this.groupStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.groupStore.selectedTag());

  // derived signals
  protected filteredGroups = computed(() => this.groupStore.filteredGroups() ?? []);
  protected groupsCount = computed(() => this.groupStore.groups()?.length ?? 0);
  protected selectedGroupsCount = computed(() => this.filteredGroups().length);
  protected isLoading = computed(() => this.groupStore.isLoading());
  protected tags = computed(() => this.groupStore.getTags());
  private currentUser = computed(() => this.groupStore.currentUser());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));

  private imgixBaseUrl = this.groupStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.groupStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.groupStore.setSelectedTag(tag);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.groupStore.add(this.readOnly()); break;
      case 'exportRaw': await this.groupStore.export("raw"); break;
      default: error(undefined, `GroupComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Group. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param group 
   */
  protected async showActions(group: GroupModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, group);
    await this.executeActions(actionSheetOptions, group);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param group 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, group: GroupModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('group.show', this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (hasRole('registered', this.groupStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('group.view', this.imgixBaseUrl, 'create_edit'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('group.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.groupStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('group.delete', this.imgixBaseUrl, 'trash_delete'));
    }
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
          await this.groupStore.delete(group, this.readOnly());
          break;
        case 'group.edit':
          await this.groupStore.edit(group, this.readOnly());
          break;
        case 'group.view':
          await this.groupStore.edit(group, true);
          break;
        case 'group.show':
          await this.groupStore.view(group, this.readOnly());
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.groupStore.currentUser());
  }
}
