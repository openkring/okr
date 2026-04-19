import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonBackdrop, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { AccountModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { FlatAccountNode } from '@bk2/finance-account-util';
import { AccountStore } from './account.store';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'bk-account-list',
  standalone: true,
  imports: [
    TranslatePipe, SvgIconPipe, AsyncPipe,
    SpinnerComponent, EmptyListComponent, MenuComponent,
    IonToolbar, IonButton, IonIcon, IonLabel, IonHeader, IonButtons,
    IonTitle, IonMenuButton, IonContent, IonItem,
    IonBackdrop, IonList, IonPopover, IonSelect, IonSelectOption
  ],
  providers: [AccountStore],
  template: `
  <ion-header>
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ '@account.plural' | translate | async }}</ion-title>
      @if(hasRole('privileged') || hasRole('admin')) {
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content>
                <bk-menu [menuName]="contextMenuName()" />
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      }
    </ion-toolbar>

    <!-- root selector -->
    <ion-toolbar>
      <ion-item lines="none">
        <ion-select
          label="{{ '@finance.account.field.selectRoot' | translate | async }}"
          [value]="accountStore.selectedRootKey()"
          (ionChange)="onRootSelected($event)"
          interface="popover">
          @for(root of accountStore.rootAccounts(); track root.bkey) {
            <ion-select-option [value]="root.bkey">{{ root.id }} {{ root.name }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
    </ion-toolbar>

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item color="primary" lines="none">
        <ion-label slot="start"><strong>{{ '@finance.account.list.header.id' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@finance.account.list.header.name' | translate | async }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    @if(isLoading()) {
      <bk-spinner />
      <ion-backdrop />
    } @else if(!accountStore.selectedRootKey()) {
      <bk-empty-list message="@finance.account.field.selectRootHint" />
    } @else if(visibleNodes().length === 0) {
      <bk-empty-list message="@finance.account.field.empty" />
    } @else {
      <ion-list lines="inset">
        @for(node of visibleNodes(); track node.account.bkey) {
          <ion-item (click)="showActions(node)" [style.padding-inline-start.px]="node.depth * 16">
            <ion-icon
              slot="start"
              [src]="expandIconName(node) | svgIcon"
              (click)="onToggleExpand($event, node.account.bkey)"
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
  protected accountStore = inject(AccountStore);
  private actionSheetController = inject(ActionSheetController);

  public contextMenuName = input.required<string>();

  protected popupId = computed(() => 'c_accounts');
  protected isLoading = computed(() => this.accountStore.isLoading());
  protected visibleNodes = computed(() => this.accountStore.visibleNodes());
  protected currentUser = computed(() => this.accountStore.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));
  private imgixBaseUrl = this.accountStore.appStore.env.services.imgixBaseUrl;

  /*-------------------------- root selection --------------------------------*/
  protected onRootSelected(event: CustomEvent): void {
    this.accountStore.selectRoot(event.detail.value);
  }

  /*-------------------------- tree expansion --------------------------------*/
  protected onToggleExpand(event: Event, bkey: string): void {
    event.stopPropagation();
    this.accountStore.toggleExpand(bkey);
  }

  /*-------------------------- popover menu --------------------------------*/
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'create': await this.accountStore.addRoot(); break;
      case 'export': await this.accountStore.exportPlan(); break;
      case 'delete':
        if (this.accountStore.selectedRootKey()) {
          const root = this.accountStore.rootAccounts().find(r => r.bkey === this.accountStore.selectedRootKey());
          if (root) await this.accountStore.delete(root, this.readOnly());
        }
        break;
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
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, node.account);
    await this.executeActions(actionSheetOptions, node.account);
  }

  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, account: AccountModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('account.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('account.add', this.imgixBaseUrl, 'add'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('account.delete', this.imgixBaseUrl, 'trash'));
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
          await this.accountStore.edit(account, this.readOnly());
          break;
        case 'account.add':
          await this.accountStore.addChild(account.bkey);
          break;
        case 'account.delete':
          await this.accountStore.delete(account, this.readOnly());
          break;
      }
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
