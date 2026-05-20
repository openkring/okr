import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, inject, input } from "@angular/core";
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonItem, IonLabel, IonList } from "@ionic/angular/standalone";

import { I18nService, TranslatePipe } from "@bk2/shared-i18n";
import { AddressModel, PrivacySettings, RoleName } from "@bk2/shared-models";
import { SvgIconPipe } from "@bk2/shared-pipes";
import { EmptyList } from "@bk2/shared-ui";
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, downloadToBrowser } from "@bk2/shared-util-angular";
import { coerceBoolean, getCategoryIcon, hasRole, isVisibleToUser } from "@bk2/shared-util-core";

import { FavoriteColorPipe, FormatAddressPipe } from "@bk2/subject-address-util";

import { AddressStore } from "./addresses.store";

import { PFX } from './scope';

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
        <bk-empty-list message="@general.noData.addresses" />
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
  protected readonly addressStore = inject(AddressStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly i18nService = inject(I18nService);

  // inputs
  public parentKey = input.required<string>(); // modelType.key of the parent model of the addresses person or org
  public intro = input<string>(); // description shown in the accordion header
  public readOnly = input<boolean>(true);
  public color = input('light'); // color of the accordion
  public label = input(PFX + 'addresses'); // label of the accordion
  public readonly priv = input.required<PrivacySettings>();

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected addresses = computed(() => this.addressStore.addresses() ?? []);
  private currentUser = computed(() => this.addressStore.currentUser());

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    as_title: PFX + 'actionsheet.title',
    as_view: PFX + 'actionsheet.view',
    as_edit: PFX + 'actionsheet.edit',
    as_copy: PFX + 'actionsheet.copy',
    as_delete: PFX + 'actionsheet.delete',
    as_email_send: PFX + 'actionsheet.email.send',
    as_email_copy: PFX + 'actionsheet.email.copy',
    as_file_upload: PFX + 'actionsheet.file.upload',
    as_file_view: PFX + 'actionsheet.file.view',
    as_phone_call: PFX + 'actionsheet.phone.call',
    as_phone_copy: PFX + 'actionsheet.phone.copy',
    as_phone_sms: PFX + 'actionsheet.phone.sms',
    as_chat_start: PFX + 'actionsheet.chat.start',
    as_postal_view: PFX + 'actionsheet.postal.view',
    as_iban_view: PFX + 'actionsheet.iban.view',
    as_iban_generate: PFX + 'actionsheet.iban.generate',
    as_web_open: PFX + 'actionsheet.web.open',
    as_web_copy: PFX + 'actionsheet.web.copy',
    as_subject_edit: PFX + 'actionsheet.subject.edit',
    as_hide: PFX + 'actionsheet.hide',
    cancel: '@cancel'
  });
  // passing constants
  private imgixBaseUrl = this.addressStore.imgixBaseUrl();

  constructor() {
    effect(() => {
      this.addressStore.setParentKey(this.parentKey());
    });
  }

  protected getChannelIcon(addressChannel: string): string {
    return getCategoryIcon(this.addressStore.getChannels(), addressChannel);
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
    const actionSheetOptions = createActionSheetOptions(this.i18n.as_title());
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
      actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_view(), this.imgixBaseUrl, 'eye-on'));
    }
    actionSheetOptions.buttons.push(createActionSheetDivider());
  
    // with address (usage)
    actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_copy(), this.imgixBaseUrl, 'copy'));
    switch(address.addressChannel) {
      case 'bankaccount':
        if (address.url) {
          actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_iban_view(), this.imgixBaseUrl, 'qrcode'));
        } else if (!this.isReadOnly()) {
          actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_iban_generate(), this.imgixBaseUrl, 'qrcode'));
        }
        break;
      case 'email':
        actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_email_send(), this.imgixBaseUrl, 'email'));
        break;
      case 'phone':
        actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_phone_call(), this.imgixBaseUrl, 'tel'));
        break;
      case 'postal':
        actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_postal_view(), this.imgixBaseUrl, 'location'));
        break;
     case 'twint':
        if (address.url) {
          actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_file_view(), this.imgixBaseUrl, 'qrcode'));
        } else if (!this.isReadOnly()) {
          actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_file_upload(), this.imgixBaseUrl, 'qrcode'));
        }
        break;
      case 'web':
        actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.as_web_open(), this.imgixBaseUrl, 'link'));
        break;
    }
    actionSheetOptions.buttons.push(createActionSheetButton(this.i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));
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
        case 'actionsheet.delete':
          await this.addressStore.delete(address, this.isReadOnly());
          break;
        case 'actionsheet.copy':
          await this.addressStore.copy(address);
          break;
        case 'actionsheet.view':
          await this.addressStore.edit(address, true);
          break;
        case 'actionsheet.edit':
          await this.addressStore.edit(address, this.isReadOnly());
          break;
        case 'actionsheet.file.view':
        case 'actionsheet.iban.view':
          await downloadToBrowser(address.url);
          break;
        case 'actionsheet.iban.generateQr':
          await this.addressStore.generateQrEzs(address);
          break;
        case 'actionsheet.email.send':
          await this.addressStore.sendEmail(address.email);
          break;
        case 'actionsheet.phone.call':
          await this.addressStore.call(address.phone);
          break;
        case 'actionsheet.postal.view':
          await this.addressStore.showPostalAddress(address);
          break;
        case 'actionsheet.file.upload':
          await this.addressStore.uploadFile(address);
          break;
        case 'actionsheet.web.open':
          await this.addressStore.openUrl(address);
          break;
      }
    }
  }

  public async add(): Promise<void> {
    this.addressStore.add(this.isReadOnly());
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.addressStore.currentUser());
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
