import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { RoleName, TransferModel } from '@bk2/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getYearList, hasRole } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';
import { AvatarDisplay } from '@bk2/avatar-ui';

import { TransferStore } from './transfer.store';

@Component({
  selector: 'bk-transfer-list',
  standalone: true,
  imports: [
    SvgIconPipe, PrettyDatePipe,
    EmptyList, ListFilter, AvatarDisplay, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonList, IonPopover
  ],
  providers: [TransferStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedTransfersCount()}}/{{transfersCount()}} {{ store.i18n.transfers() }}</ion-title>
      <ion-buttons slot="end">
        @if(hasRole('privileged') || hasRole('resourceAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="c-transfers">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-transfers" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>                  }
      </ion-buttons>
    </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter 
        (searchTermChanged)="onSearchtermChange($event)"
        (tagChanged)="onTagSelected($event)" [tags]="tags()"
        (typeChanged)="onTypeSelected($event)" [types]="types()"
        (stateChanged)="onStateSelected($event)" [states]="states()"
        (yearChanged)="onYearSelected($event)"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label class="ion-hide-md-down"><strong>{{ store.i18n.date() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.subject() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.object() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.resource() }}</strong></ion-label>
        <ion-label class="ion-hide-lg-down"><strong>{{ store.i18n.name() }}</strong></ion-label>
        <ion-label class="ion-hide-lg-down"><strong>{{ store.i18n.state() }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(selectedTransfersCount() === 0) {
      <bk-empty-list message="@transfer.field.empty" />
    } @else {
      <ion-list lines="inset">
        @for(transfer of filteredTransfers(); track $index) {
          <ion-item (click)="showActions(transfer)" detail="false">
            <ion-label class="ion-hide-md-down">{{transfer.dateOfTransfer | prettyDate}}</ion-label>
            <ion-label><bk-avatar-display [avatars]="transfer.subjects" /></ion-label>
            <ion-label><bk-avatar-display [avatars]="transfer.objects" /></ion-label>
            <ion-label>{{transfer.resource.name1}}</ion-label>
            <ion-label class="ion-hide-lg-down">{{transfer.name}}</ion-label>
            <ion-label class="ion-hide-lg-down">{{transfer.state }}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  </ion-content>
    `
})
export class TransferList {
  protected readonly store = inject(TransferStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedType());
  protected selectedState = linkedSignal(() => this.store.selectedState());
  protected selectedYear = linkedSignal(() => this.store.selectedYear());
  
  // data
  protected filteredTransfers = computed(() => this.store.filteredTransfers() ?? []);
  protected transfersCount = computed(() => this.store.transfersCount());
  protected selectedTransfersCount = computed(() => this.filteredTransfers().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.appStore.getCategory('transfer_type'));
  protected states = computed(() => this.store.appStore.getCategory('transfer_state'));
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  protected years = getYearList();
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

  protected onYearSelected(year: number): void {
    this.store.setSelectedYear(year);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: error(undefined, `TransferListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Transfer. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param transfer 
   */
  protected async showActions(transfer: TransferModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, transfer);
    await this.executeActions(actionSheetOptions, transfer);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param transfer 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, transfer: TransferModel): void {
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('transfer.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('transfer.view', this.store.i18n.as_view(), this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (hasRole('admin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('transfer.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
    }
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param transfer 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, transfer: TransferModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'transfer.delete':
          await this.store.delete(transfer, this.readOnly());
          break;
        case 'transfer.edit':
          await this.store.edit(transfer, this.readOnly());
          break;
        case 'transfer.view':
          await this.store.edit(transfer, true);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  } 
}
