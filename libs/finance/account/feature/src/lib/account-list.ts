import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonBackdrop, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AccountModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';

import { ReadOnlyBanner } from '@okr/finance-accounting-feature';

import { FlatAccountNode } from '@okr/finance-account-util';
import { AccountStore } from './account.store';

@Component({
  selector: 'okr-account-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, EmptyList, Menu, ReadOnlyBanner,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons,
    IonTitle, IonMenuButton, IonContent, IonItem,
    IonBackdrop, IonList, IonPopover
  ],
  providers: [AccountStore],
  template: `
  <ion-header>
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ store.i18n.accounts() }}</ion-title>
      @if(hasRole('privileged') || hasRole('admin')) {
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content>
                <okr-menu [menuName]="contextMenuName()" />
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      }
    </ion-toolbar>

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item color="primary" lines="none">
        <ion-label slot="start"><strong>{{ store.i18n.id() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.name() }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <okr-read-only-banner />
    @if(isLoading()) {
      <okr-spinner />
      <ion-backdrop />
    } @else if(visibleNodes().length === 0) {
      <okr-empty-list [message]="store.i18n.empty()" />
    } @else {
      <ion-list lines="inset">
        @for(node of visibleNodes(); track node.account.okey) {
          <ion-item (click)="showActions(node)" [style.padding-inline-start.px]="node.depth * 16">
            <ion-icon
              slot="start"
              [src]="expandIconName(node) | svgIcon"
              (click)="onToggleExpand($event, node.account.okey)"
            />
            <ion-label>
              <strong>{{ node.account.id }}</strong>&nbsp;{{ node.account.name }}
            </ion-label>
          </ion-item>
        }
      </ion-list>
    }
  </ion-content>
  `
})
export class AccountList {
  protected store = inject(AccountStore);
  private actionSheetController = inject(ActionSheetController);

  public contextMenuName = input.required<string>();

  protected popupId = computed(() => 'c_accounts');
  protected isLoading = computed(() => this.store.isLoading());
  protected visibleNodes = computed(() => this.store.visibleNodes());
  protected currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /*-------------------------- tree expansion --------------------------------*/
  protected onToggleExpand(event: Event, okey: string): void {
    event.stopPropagation();
    this.store.toggleExpand(okey);
  }

  /*-------------------------- popover menu --------------------------------*/
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'create': await this.store.addRoot(); break;
      case 'export': await this.store.exportPlan(); break;
      // Deleting a whole chart of accounts (root) is now done via that root row's action sheet,
      // since there is no longer a selected root at the toolbar level.
      default: error(undefined, `AccountList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /*-------------------------- tree helpers --------------------------------*/
  protected expandIconName(node: FlatAccountNode): string {
    if (!node.hasChildren) return '';
    return node.isExpanded ? 'chevron-down' : 'chevron-forward';
  }

  /*-------------------------- node action sheet --------------------------------*/
  protected async showActions(node: FlatAccountNode): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, node.account);
    await this.executeActions(actionSheetOptions, node.account);
  }

  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, account: AccountModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('account.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('account.add', this.store.i18n.create(), this.imgixBaseUrl, 'add'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('account.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
  }

  private async executeActions(actionSheetOptions: ActionSheetOptions, account: AccountModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'account.edit':
          await this.store.edit(account, this.readOnly());
          break;
        case 'account.add':
          await this.store.addChild(account.okey);
          break;
        case 'account.delete':
          await this.store.delete(account, this.readOnly());
          break;
      }
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
