import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { AddressModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error, navigateByUrl } from '@bk2/shared-util-angular';
import { generateRandomString, getCategoryIcon, hasRole } from '@bk2/shared-util-core';

import { FavoriteColorPipe, FormatAddressPipe } from '@bk2/subject-address-util';

import { AddressStore } from './addresses.store';
import { AvatarPipe } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-addresses-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, FavoriteColorPipe, FormatAddressPipe, AvatarPipe,
    SpinnerComponent, EmptyListComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton, IonIcon, IonImg,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonAvatar
],
  providers: [AddressStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
  `],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredAddressesCount()}}/{{addressesCount()}} {{ '@subject.address.plural' | translate | async }}</ion-title>
<!--           <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
             <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons> -->
      </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter 
      (searchTermChanged)="onSearchtermChange($event)"
      (typeChanged)="onChannelSelected($event)" [types]="channels()"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
    />

      <!-- list header -->
      <ion-toolbar color="primary">
        <ion-grid>
          <ion-row>
            <ion-col>
              <ion-label><strong>{{ '@subject.list.header.name' | translate | async }}</strong></ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      @if(filteredAddressesCount() === 0) {
        <bk-empty-list message="@subject.address.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(address of filteredAddresses(); track address.bkey) {
            <ion-item (click)="showActions(address)">
              <ion-avatar slot="start">
                <ion-img src="{{ address.parentKey| avatar }}" alt="Avatar Logo" />
              </ion-avatar>

              <ion-label>
                <ion-icon src="{{ 'star' | svgIcon }}" color="{{ address.isFavorite | favoriteColor }}" />
                @if(address.isCc) {
                  <ion-icon src="{{ 'cc-circle' | svgIcon }}" />
                }
                @if(address.isValidated) {
                  <ion-icon src="{{ 'shield-checkmark' | svgIcon }}" />
                }
                <ion-icon [src]="getChannelIcon(address.addressChannel) | svgIcon" />
                <span class="ion-hide-md-down"> {{ getAddressUsage(address) | translate | async }}</span>
                {{ address | formatAddress }}
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class AddressesList {
  protected readonly addressStore = inject(AddressStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  // we keep this for later, but dont use it yet
  public contextMenuName = input.required<string>();

  // derived signals
  protected addressesCount = computed(() => this.addressStore.addresses()?.length ?? 0);
  protected filteredAddresses = computed(() => this.addressStore.filteredAddresses());
  protected filteredAddressesCount = computed(() => this.filteredAddresses().length);
  protected isLoading = computed(() => this.addressStore.isLoading());
  protected tags = computed(() => this.addressStore.getTags());
  private currentUser = computed(() => this.addressStore.currentUser());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));
  protected popupId = computed(() => 'c_addresses_' + generateRandomString(5));

  private imgixBaseUrl = this.addressStore.appStore.env.services.imgixBaseUrl;
  protected channels = computed(() => this.addressStore.getChannels());

  constructor() {
    effect(() => {
        this.addressStore.setConfig('all', 'parentKey');
    })
  }
  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.addressStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.addressStore.setSelectedTag(tag);
  }

  protected onChannelSelected(channel: string): void {
    this.addressStore.setSelectedChannel(channel);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.addressStore.add(this.readOnly()); break;
      case 'exportRaw': await this.addressStore.export("raw"); break;
      default: error(undefined, `AddressesList.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on an address. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param address 
   */
  protected async showActions(address: AddressModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, address);
    await this.executeActions(actionSheetOptions, address);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * We assume that the user is always admin, because this view is only shown in AOC.
   * @param address 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, address: AddressModel): void {
    if (!hasRole('admin', this.currentUser())) return;
    actionSheetOptions.buttons.push(createActionSheetButton('address.edit', this.imgixBaseUrl, 'create_edit'));
    actionSheetOptions.buttons.push(createActionSheetButton('subject.edit', this.imgixBaseUrl, 'create_edit'));
    actionSheetOptions.buttons.push(createActionSheetButton('address.copy', this.imgixBaseUrl, 'copy'));
    switch(address.addressChannel) {
      case 'bankaccount':
        actionSheetOptions.buttons.push(createActionSheetButton('address.iban.view', this.imgixBaseUrl, 'qrcode'));
        actionSheetOptions.buttons.push(createActionSheetButton('address.iban.upload', this.imgixBaseUrl, 'qrcode'));
        break;
      case 'email':
        actionSheetOptions.buttons.push(createActionSheetButton('address.email.send', this.imgixBaseUrl, 'email'));
        break;
      case 'phone':
        actionSheetOptions.buttons.push(createActionSheetButton('address.phone.call', this.imgixBaseUrl, 'tel'));
        break;
      case 'postal':
        actionSheetOptions.buttons.push(createActionSheetButton('address.postal.view', this.imgixBaseUrl, 'location'));
        break;
      case 'web':
        actionSheetOptions.buttons.push(createActionSheetButton('address.web.open', this.imgixBaseUrl, 'link'));
        break;
    }
    actionSheetOptions.buttons.push(createActionSheetButton('address.delete', this.imgixBaseUrl, 'trash_delete'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param address 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, address: AddressModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'address.delete':
          await this.addressStore.delete(address, false);
          break;
        case 'address.copy':
          await this.addressStore.copy(address);
          break;
        case 'address.edit':
          await this.addressStore.edit(address, false);
          break;
        case 'subject.edit':
          await this.addressStore.editSubject(address.parentKey);
          break;
        case 'address.iban.view':
          await this.addressStore.showQrEzs(address);
          break;
        case 'address.iban.upload':
          await this.addressStore.uploadQrEzs(address);
          break;
        case 'address.email.send':
          await this.addressStore.sendEmail(address.email);
          break;
        case 'address.phone.call':
          await this.addressStore.call(address.phone);
          break;
        case 'address.postal.view':
          await this.addressStore.showPostalAddress(address);
          break;
        case 'address.web.open':
          await this.addressStore.openUrl(address);
          break;
      }
    }
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.addressStore.currentUser());
  }

  protected getChannelIcon(addressChannel: string): string {
    return getCategoryIcon(this.addressStore.getChannels(), addressChannel);
  }

  protected getAddressUsage(address: AddressModel): string {
    if (address.addressUsage === 'custom') {
      return address.addressUsageLabel;
    } else {
      return `@${this.addressStore.getUsages().i18nBase}.${address.addressUsage}.label`;
    }
  }

  protected async goto(parentKey: string): Promise<void> {
    const [modelType, bkey] = parentKey.split('.');
    if (!parentKey || parentKey.length === 0) return;
    if (modelType === '')
    await navigateByUrl(this.addressStore.router, `/${modelType}/${bkey}`);
  }
}
