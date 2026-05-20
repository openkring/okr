import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { RoleName, WorkrelModel } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { Menu } from '@bk2/cms-menu-feature';
import { WorkrelNamePipe } from '@bk2/relationship-workrel-util';

import { WorkrelStore } from './workrel.store';

@Component({
  selector: 'bk-workrel-list',
  standalone: true,
  imports: [
    SvgIconPipe, AvatarPipe, FullNamePipe, WorkrelNamePipe, AsyncPipe,
    ListFilter, EmptyList, Spinner, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonImg, IonList, IonGrid, IonRow, IonCol, IonAvatar, IonPopover
  ],
  providers: [WorkrelStore],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedWorkRelsCount()}}/{{workRelsCount()}} {{ store.i18n.workrels() }}</ion-title>
        <ion-buttons slot="end">
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
            <ion-buttons slot="end">
              <ion-button id="c-wrel">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="c-wrel" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      (typeChanged)="onTypeSelected($event)" [types]="types()"
      (stateChanged)="onStateSelected($event)" [states]="states()"
      [showIcons]=false
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{ store.i18n.subject() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.type() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.object() }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading() === true) {
      <bk-spinner />
    } @else {
      @if(selectedWorkRelsCount() === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(workrel of filteredWorkRels(); track $index) {
            <ion-grid (click)="showActions(workrel)">
              <ion-row>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ 'person.' + workrel.subjectKey | avatar }}" alt="avatar of first person" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{workrel.subjectName1 | fullName:workrel.subjectName2}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="6" size-md="4">
                  <ion-item lines="none">
                    <ion-label>{{ workrel | workrelName:types() | async }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ 'org.' + workrel.objectKey | avatar }}" alt="avatar of second person" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{workrel.objectName }}</ion-label>
                  </ion-item> 
                </ion-col>
              </ion-row>
            </ion-grid>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class WorkrelList {
  protected store = inject(WorkrelStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedType());
  protected selectedState = linkedSignal(() => this.store.selectedState());

  // data
  protected filteredWorkRels = computed(() => this.store.filteredWorkrels());
  protected allWorkRels = computed(() => this.store.allWorkrels());
  protected workRelsCount = computed(() => this.store.allWorkrels()?.length ?? 0);
  protected selectedWorkRelsCount = computed(() => this.filteredWorkRels()?.length ?? 0);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.appStore.getCategory('workrel_type'));
  protected states = computed(() => this.store.appStore.getCategory('workrel_state'));
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedType(type);
  }

  protected onStateSelected(state: string): void {
    this.store.setSelectedState(state);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export('raw'); break;
      default: error(undefined, `WorkrelList.call: unknown method ${selectedMethod}`);
    }
  }

    /**
     * Displays an ActionSheet with all possible actions on a Work Relationship. Only actions are shown, that the user has permission for.
     * After user selected an action this action is executed.
     * @param workRel 
     */
    protected async showActions(workRel: WorkrelModel): Promise<void> {
      const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
      this.addActionSheetButtons(actionSheetOptions, workRel);
      await this.executeActions(actionSheetOptions, workRel);
    }
  
    /**
     * Fills the ActionSheet with all possible actions, considering the user permissions.
     * @param workRel 
     */
    private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, workRel: WorkrelModel): void {
      if (hasRole('registered', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('workrel.view', this.store.i18n.as_view(), this.imgixBaseUrl, 'eye-on'));
        actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
      }
      if (!(this.readOnly())) {
        actionSheetOptions.buttons.push(createActionSheetButton('workrel.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
        if (isOngoing(workRel.validTo)) {
          actionSheetOptions.buttons.push(createActionSheetButton('workrel.end', this.store.i18n.as_end(), this.imgixBaseUrl, 'stop-circle'));
        }
      }
      if (hasRole('admin', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('workrel.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
      }
      if (actionSheetOptions.buttons.length === 1) { // only cancel button
        actionSheetOptions.buttons = [];
      }
    }
  
    /**
     * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
     * @param actionSheetOptions 
     * @param workRel 
     */
    private async executeActions(actionSheetOptions: ActionSheetOptions, workRel: WorkrelModel): Promise<void> {
      if (actionSheetOptions.buttons.length > 0) {
        const actionSheet = await this.actionSheetController.create(actionSheetOptions);
        await actionSheet.present();
        const { data } = await actionSheet.onDidDismiss();
        if (!data) return;
        switch (data.action) {
          case 'workrel.delete':
            await this.store.delete(workRel, this.readOnly());
            break;
          case 'workrel.edit':
            await this.store.edit(workRel, this.readOnly());
            break;
          case 'workrel.view':
            await this.store.edit(workRel, true);
            break;
          case 'workrel.end':
            await this.store.end(workRel, this.readOnly());
            break;
        }
      }
    }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected isOngoing(workrel: WorkrelModel): boolean {
    return isOngoing(workrel.validTo);
  }
}
