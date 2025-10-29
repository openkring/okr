import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupModel, ModelType, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { GroupListStore } from './group-list.store';

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
  providers: [GroupListStore],
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
      [tags]="groupTags()"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
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
                <ion-img src="{{ modelType.Group + '.' + group.bkey | avatar | async }}" alt="Avatar Logo" />
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
  protected readonly groupListStore = inject(GroupListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredGroups = computed(() => this.groupListStore.filteredGroups() ?? []);
  protected groupsCount = computed(() => this.groupListStore.groups()?.length ?? 0);
  protected selectedGroupsCount = computed(() => this.filteredGroups().length);
  protected isLoading = computed(() => this.groupListStore.isLoading());
  protected groupTags = computed(() => this.groupListStore.getTags());

  protected modelType = ModelType;
  private imgixBaseUrl = this.groupListStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.groupListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.groupListStore.setSelectedTag($event);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    console.log('GroupListComponent.onPopoverDismiss', $event);
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.groupListStore.add(); break;
      case 'exportRaw': await this.groupListStore.export("raw_groups"); break;
      default: error(undefined, `GroupListComponent.call: unknown method ${selectedMethod}`);
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
    actionSheetOptions.buttons.push(createActionSheetButton('show', this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (hasRole('memberAdmin', this.groupListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.groupListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
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
      switch (data.action) {
        case 'delete':
          await this.groupListStore.delete(group);
          break;
        case 'edit':
          await this.groupListStore.edit(group);
          break;
        case 'show':
          await this.groupListStore.view(group);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.groupListStore.currentUser());
  }
}
