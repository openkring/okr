import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ResourceModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getCategoryIcon, hasRole } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';

import { ResourceStore } from './resource.store';

@Component({
  selector: 'bk-rowing-boat-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Menu, ListFilter, Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList, IonPopover, IonIcon, IonItem, IonLabel, IonContent
  ],
  providers: [ResourceStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedBoatsCount()}}/{{boatsCount() }} {{ store.i18n.rboat_plural() }}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c_rboat">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c_rboat" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      <ion-label><strong>{{ store.i18n.rboat_name() }}</strong></ion-label>
      <ion-label><strong>{{ store.i18n.rboat_type() }}</strong></ion-label>
      <ion-label class="ion-hide-md-down"><strong>{{ store.i18n.load() }}</strong></ion-label>
    </ion-item>
  </ion-toolbar>
</ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if(selectedBoatsCount() === 0) {
      <bk-empty-list [message]="store.i18n.rboat_empty()" />
    } @else {
      <ion-list lines="inset">
        @for(boat of filteredBoats(); track $index) {
          <ion-item class="ion-text-wrap" (click)="showActions(boat)">
            <ion-icon slot="start" src="{{ getCategoryIcon(boat) | svgIcon }}" />
            <ion-label>{{ boat.name }}</ion-label>
            <ion-label>{{ boat.subType }}</ion-label>
            <ion-label class="ion-hide-md-down">{{ boat?.load }}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  }
</ion-content>
  `
})
export class RowingBoatList {
  protected readonly store = inject(ResourceStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // data
  protected filteredBoats = computed(() => this.store.filteredRboats() ?? []);
  protected boatsCount = computed(() => this.store.rboatsCount());
  protected selectedBoatsCount = computed(() => this.filteredBoats().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags('rboat'));
  protected types = computed(() => this.store.appStore.getCategory('rboat_type'));
  protected currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /******************************** getters ******************************************* */
  protected getIcon(resource: ResourceModel): string | undefined {
    return this.store.appStore.getCategoryItem('rboat_type', resource.subType)?.icon;
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedSubType(type);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(false, false); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: error(undefined, `RowingBoatList.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a rowing boat. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param boat 
   */
  protected async showActions(boat: ResourceModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, boat);
    await this.executeActions(actionSheetOptions, boat);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param boat 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, boat: ResourceModel): void {
    if (hasRole('registered', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('rboat.view', this.store.i18n.rboat_view(), this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    }
    if (hasRole('resourceAdmin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('rboat.edit', this.store.i18n.rboat_edit(), this.imgixBaseUrl, 'edit'));
    }
    if (hasRole('admin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('rboat.delete', this.store.i18n.rboat_delete(), this.imgixBaseUrl, 'trash'));
    }
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param boat 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, boat: ResourceModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'rboat.delete':
          await this.store.delete(boat, this.readOnly());
          break;
        case 'rboat.edit':
          await this.store.edit(boat, false, this.readOnly());
          break;
        case 'rboat.view':
          await this.store.edit(boat, false, true);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected getCategoryIcon(boat: ResourceModel): string {
    return getCategoryIcon(this.types(), boat.subType);
  }
}

