import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, TransferModel } from '@bk2/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getYearList, hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';
import { AvatarDisplayComponent } from '@bk2/avatar-ui';

import { TransferStore } from './transfer.store';

@Component({
  selector: 'bk-transfer-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PrettyDatePipe,
    EmptyListComponent, ListFilterComponent, AvatarDisplayComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonList, IonPopover
  ],
  providers: [TransferStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedTransfersCount()}}/{{transfersCount()}} {{ '@transfer.plural' | translate | async }}</ion-title>
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
        <ion-label class="ion-hide-md-down"><strong>{{ '@transfer.list.header.dateOfTransfer' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@transfer.list.header.subject' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@transfer.list.header.object' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@transfer.list.header.resource' | translate | async }}</strong></ion-label>
        <ion-label class="ion-hide-lg-down"><strong>{{ '@transfer.list.header.name' | translate | async }}</strong></ion-label>
        <ion-label class="ion-hide-lg-down"><strong>{{ '@transfer.list.header.state' | translate | async }}</strong></ion-label>
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
export class TransferListComponent {
  protected readonly transferStore = inject(TransferStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.transferStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.transferStore.selectedTag());
  protected selectedType = linkedSignal(() => this.transferStore.selectedType());
  protected selectedState = linkedSignal(() => this.transferStore.selectedState());
  protected selectedYear = linkedSignal(() => this.transferStore.selectedYear());
  
  // data
  protected filteredTransfers = computed(() => this.transferStore.filteredTransfers() ?? []);
  protected transfersCount = computed(() => this.transferStore.transfersCount());
  protected selectedTransfersCount = computed(() => this.filteredTransfers().length);
  protected isLoading = computed(() => this.transferStore.isLoading());
  protected tags = computed(() => this.transferStore.getTags());
  protected types = computed(() => this.transferStore.appStore.getCategory('transfer_type'));
  protected states = computed(() => this.transferStore.appStore.getCategory('transfer_state'));
  protected currentUser = computed(() => this.transferStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  protected years = getYearList();
  private imgixBaseUrl = this.transferStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.transferStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.transferStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.transferStore.setSelectedType(type);
  }

  protected onStateSelected(state: string): void {
    this.transferStore.setSelectedState(state);
  }

  protected onYearSelected(year: number): void {
    this.transferStore.setSelectedYear(year);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.transferStore.add(this.readOnly()); break;
      case 'exportRaw': await this.transferStore.export("raw"); break;
      default: error(undefined, `TransferListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Transfer. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param transfer 
   */
  protected async showActions(transfer: TransferModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, transfer);
    await this.executeActions(actionSheetOptions, transfer);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param transfer 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, transfer: TransferModel): void {
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('transfer.edit', this.imgixBaseUrl, 'create_edit'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('transfer.view', this.imgixBaseUrl, 'eye-on'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (hasRole('admin', this.transferStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('transfer.delete', this.imgixBaseUrl, 'trash_delete'));
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
          await this.transferStore.delete(transfer, this.readOnly());
          break;
        case 'transfer.edit':
          await this.transferStore.edit(transfer, this.readOnly());
          break;
        case 'transfer.view':
          await this.transferStore.edit(transfer, true);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.transferStore.currentUser());
  } 
}
