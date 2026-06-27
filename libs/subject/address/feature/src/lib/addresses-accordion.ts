import { Component, computed, effect, inject, input } from "@angular/core";
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonItem, IonLabel, IonList } from "@ionic/angular/standalone";

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
        <ion-label>{{ title() }}</ion-label>
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
                  <span class="ion-hide-md-down"> {{ getAddressUsage(address) }}</span>
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
  public label = input<string | undefined>(); // label of the accordion
  public readonly priv = input.required<PrivacySettings>();

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected addresses = computed(() => this.store.addresses() ?? []);
  private currentUser = computed(() => this.store.currentUser());

  // derived
  protected title = computed(() => this.label() ?? this.store.i18n.addresses());

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
    if (address.addressUsage === 'custom') return address.addressUsageLabel;
    switch (address.addressUsage) {
      case 'home':   return this.store.i18n.usage_home_label();
      case 'work':   return this.store.i18n.usage_work_label();
      case 'mobile': return this.store.i18n.usage_mobile_label();
      default:       return address.addressUsage;
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
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.store.i18n.update_label(), this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.store.i18n.delete_label(), this.imgixBaseUrl, 'trash'));
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton('view', this.store.i18n.view_label(), this.imgixBaseUrl, 'eye-on'));
    }
    actionSheetOptions.buttons.push(createActionSheetDivider());
  
    // with address (usage)
    actionSheetOptions.buttons.push(createActionSheetButton('copy', this.store.i18n.copy_label(), this.imgixBaseUrl, 'copy'));
    switch(address.addressChannel) {
      case 'bankaccount':
        if (address.url) {
          actionSheetOptions.buttons.push(createActionSheetButton('iban.view', this.store.i18n.view_iban(), this.imgixBaseUrl, 'qrcode'));
        } else if (!this.isReadOnly()) {
          actionSheetOptions.buttons.push(createActionSheetButton('iban.generateQr', this.store.i18n.generate_qrezs(), this.imgixBaseUrl, 'qrcode'));
        }
        break;
      case 'email':
        actionSheetOptions.buttons.push(createActionSheetButton('email.send', this.store.i18n.send_email_label(), this.imgixBaseUrl, 'email'));
        break;
      case 'phone':
        actionSheetOptions.buttons.push(createActionSheetButton('phone.call', this.store.i18n.call_phone(), this.imgixBaseUrl, 'tel'));
        break;
      case 'postal':
        actionSheetOptions.buttons.push(createActionSheetButton('postal.view', this.store.i18n.view_postal(), this.imgixBaseUrl, 'location'));
        break;
     case 'twint':
        if (address.url) {
          actionSheetOptions.buttons.push(createActionSheetButton('file.view', this.store.i18n.view_file(), this.imgixBaseUrl, 'qrcode'));
        } else if (!this.isReadOnly()) {
          actionSheetOptions.buttons.push(createActionSheetButton('file.upload', this.store.i18n.upload_file(), this.imgixBaseUrl, 'qrcode'));
        }
        break;
      case 'web': {
        // Open the link from the synchronous tap handler (not the post-dismiss switch) so the
        // user gesture survives — Safari blocks window.open once the ActionSheet has dismissed.
        const webButton = createActionSheetButton('web.open', this.store.i18n.open_web(), this.imgixBaseUrl, 'link');
        webButton.handler = () => { this.store.openWeb(address); };
        actionSheetOptions.buttons.push(webButton);
        break;
      }
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));
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
        // 'web.open' is handled synchronously by the button handler (Safari popup blocker).
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
