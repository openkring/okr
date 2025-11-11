import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, TransferModel } from '@bk2/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { AvatarDisplayComponent, EmptyListComponent, ListFilterComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getYearList, hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { TransferListStore } from './transfer-list.store';

@Component({
  selector: 'bk-transfer-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PrettyDatePipe,
    EmptyListComponent, ListFilterComponent, AvatarDisplayComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonList, IonPopover
  ],
  providers: [TransferListStore],
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
      [tags]="tags()" (tagChanged)="onTagSelected($event)"
      [type]="types()" (typeChanged)="onTypeChange($event)"
      [state]="states()" (stateChanged)="onStateChange($event)"
      [years]="years" (yearChanged)="onYearChange($event)"
      (searchTermChanged)="onSearchtermChange($event)"
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
            <ion-label>{{transfer.resource.name}}</ion-label>
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
  protected readonly transferListStore = inject(TransferListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredTransfers = computed(() => this.transferListStore.filteredTransfers() ?? []);
  protected transfersCount = computed(() => this.transferListStore.transfersCount());
  protected selectedTransfersCount = computed(() => this.filteredTransfers().length);
  protected isLoading = computed(() => this.transferListStore.isLoading());
  protected tags = computed(() => this.transferListStore.getTags());
  protected types = computed(() => this.transferListStore.appStore.getCategory('transfer_type'));
  protected states = computed(() => this.transferListStore.appStore.getCategory('transfer_state'));

  protected years = getYearList();
  private imgixBaseUrl = this.transferListStore.appStore.env.services.imgixBaseUrl;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.transferListStore.add(); break;
      case 'exportRaw': await this.transferListStore.export("raw"); break;
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
    if (hasRole('resourceAdmin', this.transferListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (hasRole('admin', this.transferListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
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
      switch (data.action) {
        case 'delete':
          await this.transferListStore.delete(transfer);
          break;
        case 'edit':
          await this.transferListStore.edit(transfer);
          break;
      }
    }
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.transferListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.transferListStore.setSelectedTag($event);
  }

  protected onStateChange(state: string): void {
    this.transferListStore.setSelectedState(state);
  }

  protected onYearChange(year: number): void {
    this.transferListStore.setSelectedYear(year);
  }

  protected onTypeChange(transferType: string): void {
    this.transferListStore.setSelectedType(transferType);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.transferListStore.currentUser());
  } 
}
