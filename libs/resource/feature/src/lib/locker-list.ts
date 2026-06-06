import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ResourceModel, RoleName } from '@bk2/shared-models';
import { PartPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';

import { ResourceStore } from './resource.store';

@Component({
  selector: 'bk-locker-list',
  standalone: true,
  imports: [
    SvgIconPipe, PartPipe,
    Spinner, EmptyList, Menu, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList, IonPopover,
    IonIcon, IonItem, IonLabel, IonContent
  ],
  providers: [ResourceStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedLockersCount()}}/{{lockersCount() }} {{ store.i18n.locker_plural() }}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c_resource">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c_resource" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      (typeChanged)="onTypeSelected($event)" [types]="types()"
     />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item color="primary" lines="none">
        <ion-label><strong>{{ store.i18n.locker_nr() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.key_nr() }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if(selectedLockersCount() === 0) {
      <bk-empty-list [message]="store.i18n.locker_empty()" />
    } @else {
      <ion-list lines="inset">
        @for(locker of filteredLockers(); track $index) {
          <ion-item class="ion-text-wrap" (click)="showActions(locker)">
            <ion-icon slot="start" src="{{ getIcon(locker) | svgIcon }}" />
            <ion-label>{{ locker.name | part:true:'/' }}</ion-label>
            <ion-label>{{ locker.name | part:false:'/' }}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  }
</ion-content>
  `
})
export class LockerList {
  protected readonly store = inject(ResourceStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedResourceType());

  // data
  protected filteredLockers = computed(() => this.store.filteredLockers() ?? []);
  protected lockersCount = computed(() => this.store.lockersCount());
  protected selectedLockersCount = computed(() => this.filteredLockers().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags('locker'));
  protected types = computed(() => this.store.appStore.getCategory('gender'));
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************** getters ******************************************* */
  protected getIcon(resource: ResourceModel): string {
    switch(resource.subType) {
      case 'male': return 'gender_male';
      case 'female': return 'gender_female';
      case 'other': return 'gender_diverse';
      default: return 'help';
    }
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedResourceType(type);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(false, false); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: error(undefined, `LockerListComponent.call: unknown method ${selectedMethod}`);
    }
  }

    /**
     * Displays an ActionSheet with all possible actions on a locker. Only actions are shown, that the user has permission for.
     * After user selected an action this action is executed.
     * @param key 
     */
    protected async showActions(key: ResourceModel): Promise<void> {
      const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
      this.addActionSheetButtons(actionSheetOptions, key);
      await this.executeActions(actionSheetOptions, key);
    }
  
    /**
     * Fills the ActionSheet with all possible actions, considering the user permissions.
     * @param key 
     */
    private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, key: ResourceModel): void {
      if (hasRole('registered', this.store.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('locker.view', this.store.i18n.locker_view(), this.imgixBaseUrl, 'eye-on'));
        actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
      }
      if (hasRole('resourceAdmin', this.store.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('locker.edit', this.store.i18n.locker_update(), this.imgixBaseUrl, 'edit'));
      }
      if (hasRole('admin', this.store.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('locker.delete', this.store.i18n.locker_delete(), this.imgixBaseUrl, 'trash'));
      }
      if (actionSheetOptions.buttons.length === 1) { // only cancel button
        actionSheetOptions.buttons = [];
      }
    }
  
    /**
     * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
     * @param actionSheetOptions 
     * @param key 
     */
    private async executeActions(actionSheetOptions: ActionSheetOptions, key: ResourceModel): Promise<void> {
      if (actionSheetOptions.buttons.length > 0) {
        const actionSheet = await this.actionSheetController.create(actionSheetOptions);
        await actionSheet.present();
        const { data } = await actionSheet.onDidDismiss();
        if (!data) return;
        switch (data.action) {
          case 'locker.delete':
            await this.store.delete(key, this.readOnly());
            break;
          case 'locker.view':
            await this.store.edit(key, false, true);
            break;
          case 'locker.edit':
            await this.store.edit(key, false, this.readOnly());
            break;
        }
      }
    }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}

