import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ResourceModel, RoleName } from '@bk2/shared-models';
import { PartPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { ResourceListStore } from './resource-list.store';

@Component({
  selector: 'bk-locker-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PartPipe,
    SpinnerComponent, EmptyListComponent,
    MenuComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList, IonPopover,
    IonIcon, IonItem, IonLabel, IonContent
  ],
  providers: [ResourceListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedLockersCount()}}/{{lockersCount() }} {{ title | translate | async}}</ion-title>
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
        <ion-label><strong>{{ '@input.lockerNr.label' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@input.keyNr.label' | translate | async }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if(selectedLockersCount() === 0) {
      <bk-empty-list message="@resource.locker.field.empty" />
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
export class LockerListComponent {
  protected readonly resourceListStore = inject(ResourceListStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.resourceListStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.resourceListStore.selectedTag());
  protected selectedType = linkedSignal(() => this.resourceListStore.selectedResourceType());

  // data
  protected filteredLockers = computed(() => this.resourceListStore.filteredLockers() ?? []);
  protected lockersCount = computed(() => this.resourceListStore.lockersCount());
  protected selectedLockersCount = computed(() => this.filteredLockers().length);
  protected isLoading = computed(() => this.resourceListStore.isLoading());
  protected tags = computed(() => this.resourceListStore.getLockerTags());
  protected types = computed(() => this.resourceListStore.appStore.getCategory('gender'));
  protected title = '@resource.locker.plural';
  protected currentUser = computed(() => this.resourceListStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  private imgixBaseUrl = this.resourceListStore.appStore.env.services.imgixBaseUrl;

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
    this.resourceListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.resourceListStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.resourceListStore.setSelectedResourceType(type);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.resourceListStore.add(false, false); break;
      case 'exportRaw': await this.resourceListStore.export("raw"); break;
      default: error(undefined, `LockerListComponent.call: unknown method ${selectedMethod}`);
    }
  }

    /**
     * Displays an ActionSheet with all possible actions on a locker. Only actions are shown, that the user has permission for.
     * After user selected an action this action is executed.
     * @param key 
     */
    protected async showActions(key: ResourceModel): Promise<void> {
      const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      this.addActionSheetButtons(actionSheetOptions, key);
      await this.executeActions(actionSheetOptions, key);
    }
  
    /**
     * Fills the ActionSheet with all possible actions, considering the user permissions.
     * @param key 
     */
    private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, key: ResourceModel): void {
      if (hasRole('registered', this.resourceListStore.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('locker.view', this.imgixBaseUrl, 'eye-on'));
        actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
      }
      if (hasRole('resourceAdmin', this.resourceListStore.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('locker.edit', this.imgixBaseUrl, 'create_edit'));
      }
      if (hasRole('admin', this.resourceListStore.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('locker.delete', this.imgixBaseUrl, 'trash_delete'));
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
        switch (data.action) {
          case 'locker.delete':
            await this.resourceListStore.delete(key, this.readOnly());
            break;
          case 'locker.view':
            await this.resourceListStore.edit(key, false, true);
            break;
          case 'locker.edit':
            await this.resourceListStore.edit(key, false, this.readOnly());
            break;
        }
      }
    }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.resourceListStore.currentUser());
  }
}

