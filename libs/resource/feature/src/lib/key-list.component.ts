import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ResourceModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { ResourceListStore } from './resource-list.store';
import { ActionSheetController } from '@ionic/angular/standalone';

@Component({
  selector: 'bk-key-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent,
    MenuComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList,
    IonIcon, IonItem, IonLabel, IonContent, IonPopover
  ],
  providers: [ResourceListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedKeysCount()}}/{{keysCount() }} {{ title | translate | async}}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c_key">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c_key" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      [tags]="keyTags()"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
     />

    <!-- list header -->
  <ion-toolbar color="primary">
    <ion-item color="primary" lines="none">
      <ion-label><strong>{{ '@input.keyName.label' | translate | async }}</strong></ion-label>
      <ion-label><strong>{{ '@input.description.label' | translate | async }}</strong></ion-label>
    </ion-item>
  </ion-toolbar>
</ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if(selectedKeysCount() === 0) {
      <bk-empty-list message="@resource.key.field.empty" />
    } @else {
      <ion-list lines="full">
        @for(key of filteredKeys(); track $index) {
          <ion-item class="ion-text-wrap" (click)="showActions(key)">
            <ion-icon slot="start" src="{{ 'resource_key' | svgIcon }}" />
            <ion-label>{{ key.name }}</ion-label>
            <ion-label>{{ key.description }}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  }
</ion-content>
  `
})
export class KeyListComponent {
  protected readonly resourceListStore = inject(ResourceListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredKeys = computed(() => this.resourceListStore.filteredKeys() ?? []);
  protected keysCount = computed(() => this.resourceListStore.keysCount());
  protected selectedKeysCount = computed(() => this.filteredKeys().length);
  protected isLoading = computed(() => this.resourceListStore.isLoading());
  protected keyTags = computed(() => this.resourceListStore.getKeyTags() ?? []);
  protected title = '@resource.key.plural'
  private imgixBaseUrl = this.resourceListStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.resourceListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.resourceListStore.setSelectedTag($event);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.resourceListStore.add(false); break;
      case 'exportRaw': await this.resourceListStore.export("raw"); break;
      default: error(undefined, `BoatListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a key. Only actions are shown, that the user has permission for.
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
    if (hasRole('resourceAdmin', this.resourceListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (hasRole('admin', this.resourceListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
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
        case 'delete':
          await this.resourceListStore.delete(key);
          break;
        case 'edit':
          await this.resourceListStore.edit(key);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.resourceListStore.currentUser());
  }
}

