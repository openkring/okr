import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, inject, input } from "@angular/core";
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonItem, IonLabel, IonList } from "@ionic/angular/standalone";

import { TranslatePipe } from "@bk2/shared-i18n";
import { AddressModel, PrivacySettings, RoleName } from "@bk2/shared-models";
import { SvgIconPipe } from "@bk2/shared-pipes";
import { EmptyList } from "@bk2/shared-ui";
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, downloadToBrowser } from "@bk2/shared-util-angular";
import { coerceBoolean, getCategoryIcon, hasRole, isVisibleToUser } from "@bk2/shared-util-core";

import { FavoriteColorPipe, FormatAddressPipe } from "@bk2/subject-address-util";

import { AddressStore } from "./addresses.store";

@Component({
  selector: 'bk-addresses-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe,
    FavoriteColorPipe, FormatAddressPipe, SvgIconPipe,
    EmptyList,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonList
  ],
  styles: [`
    ion-icon {
      padding-right: 5px;
    }
  `],
  providers: [AddressStore],
  template: `
  <ion-accordion toggle-icon-slot="start" value="addresses">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ label() | translate | async }}</ion-label>
        @if(!isReadOnly()) {
          <ion-button fill="clear" (click)="add()" size="default">
            <ion-icon color="secondary" slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
          </ion-button>
        }
    </ion-item>
    <div slot="content">
      @if(intro(); as intro) {
        <ion-item lines="none">
          <ion-label>{{ intro }}</ion-label>
        </ion-item>
      }  
      @if(addresses().length === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(address of addresses(); track $index) {
            @if(isVisibleToUser(address)) {
              <ion-item (click)="showActions(address)">
                <ion-label>
                  <ion-icon src="{{ 'star' | svgIcon }}" color="{{ address.isFavorite | favoriteColor }}" />
                  @if(address.isCc) {
                    <ion-icon src="{{ 'cc-circle' | svgIcon }}" />
                  }
                  @if(address.isValidated) {
                    <ion-icon src="{{ 'shield' | svgIcon }}" />
                  }
                  <ion-icon [src]="getChannelIcon(address.addressChannel) | svgIcon" />
                  <span class="ion-hide-md-down"> {{ getAddressUsage(address) | translate | async }}</span>
                  {{ address | formatAddress }}
                </ion-label>
                @if((address.addressChannel === 'bankaccount' || address.addressChannel === 'twint') && address.url) {
                  <ion-icon slot="end" src="{{ 'qrcode' | svgIcon }}" />
                }
              </ion-item>
            }
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class AddressesAccordion {
  protected readonly store = inject(AddressStore);
  private readonly actionSheetController = inject(ActionSheetController);

  // inputs
  public parentKey = input.required<string>(); // modelType.key of the parent model of the addresses person or org
  public intro = input<string>(); // description shown in the accordion header
  public readOnly = input<boolean>(true);
  public color = input('light'); // color of the accordion
  public label = input(this.store.i18n.addresses()); // label of the accordion
  public readonly priv = input.required<PrivacySettings>();

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected addresses = computed(() => this.store.addresses() ?? []);
  private currentUser = computed(() => this.store.currentUser());

  // passing constants
  private imgixBaseUrl = this.store.imgixBaseUrl();

  constructor() {
    effect(() => {
      this.store.setParentKey(this.parentKey());
    });
  }

  protected getChannelIcon(addressChannel: string): string {
    return getCategoryIcon(this.store.getChannels(), addressChannel);
  }

  protected getAddressUsage(address: AddressModel): string {
    if (address.addressUsage === 'custom') {
      return address.addressUsageLabel;
    } else {
      return `${PFX}usage.${address.addressUsage}.label`;
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on an address. Only actions are shown, the user has permission for.
   * After user selected an action this action is executed.
   * @param address 
   */
  protected async showActions(address: AddressModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, address);
    await this.executeActions(actionSheetOptions, address);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param address 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, address: AddressModel): void {
    // on address
    actionSheetOptions.buttons.push(createActionSheetDivider());
    if (this.hasRole('memberAdmin') || this.hasRole('admin')) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton('view', this.store.i18n.as_view(), this.imgixBaseUrl, 'eye-on'));
    }
    actionSheetOptions.buttons.push(createActionSheetDivider());
  
    // with address (usage)
    actionSheetOptions.buttons.push(createActionSheetButton('copy', this.store.i18n.as_copy(), this.imgixBaseUrl, 'copy'));
    switch(address.addressChannel) {
      case 'bankaccount':
        if (address.url) {
          actionSheetOptions.buttons.push(createActionSheetButton('iban.view', this.store.i18n.as_iban_view(), this.imgixBaseUrl, 'qrcode'));
        } else if (!this.isReadOnly()) {
          actionSheetOptions.buttons.push(createActionSheetButton('iban.generateQr', this.store.i18n.as_iban_genqr(), this.imgixBaseUrl, 'qrcode'));
        }
        break;
      case 'email':
        actionSheetOptions.buttons.push(createActionSheetButton('email.send', this.store.i18n.as_email_send(), this.imgixBaseUrl, 'email'));
        break;
      case 'phone':
        actionSheetOptions.buttons.push(createActionSheetButton('phone.call', this.store.i18n.as_phone_call(), this.imgixBaseUrl, 'tel'));
        break;
      case 'postal':
        actionSheetOptions.buttons.push(createActionSheetButton('postal.view', this.store.i18n.as_postal_view(), this.imgixBaseUrl, 'location'));
        break;
     case 'twint':
        if (address.url) {
          actionSheetOptions.buttons.push(createActionSheetButton('file.view', this.store.i18n.as_file_view(), this.imgixBaseUrl, 'qrcode'));
        } else if (!this.isReadOnly()) {
          actionSheetOptions.buttons.push(createActionSheetButton('file.upload', this.store.i18n.as_file_upload(), this.imgixBaseUrl, 'qrcode'));
        }
        break;
      case 'web':
        actionSheetOptions.buttons.push(createActionSheetButton('web.open', this.store.i18n.as_web_open(), this.imgixBaseUrl, 'link'));
        break;
    }
    actionSheetOptions.buttons.push(createActionSheetButton(this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));
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
        case 'delete':
          await this.store.delete(address, this.isReadOnly());
          break;
        case 'copy':
          await this.store.copy(address);
          break;
        case 'view':
          await this.store.edit(address, true);
          break;
        case 'edit':
          await this.store.edit(address, this.isReadOnly());
          break;
        case 'file.view':
        case 'iban.view':
          await downloadToBrowser(address.url);
          break;
        case 'iban.generateQr':
          await this.store.generateQrEzs(address);
          break;
        case 'email.send':
          await this.store.sendEmail(address.email);
          break;
        case 'phone.call':
          await this.store.call(address.phone);
          break;
        case 'postal.view':
          await this.store.showPostalAddress(address);
          break;
        case 'file.upload':
          await this.store.uploadFile(address);
          break;
        case 'web.open':
          await this.store.openUrl(address);
          break;
      }
    }
  }

  public async add(): Promise<void> {
    this.store.add(this.isReadOnly());
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected isVisibleToUser(address: AddressModel): boolean {
    switch(address.addressChannel) {
      case 'phone': 
        return isVisibleToUser(this.priv().showPhone, this.currentUser());
      case 'email':
        return isVisibleToUser(this.priv().showEmail, this.currentUser());
      case 'postal':
        return isVisibleToUser(this.priv().showPostalAddress, this.currentUser());
      case 'bankaccount':
        return isVisibleToUser(this.priv().showIban, this.currentUser());
      default: return true;
    }
  }
}
