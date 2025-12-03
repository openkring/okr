import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, inject, input } from "@angular/core";
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonItem, IonLabel, IonList } from "@ionic/angular/standalone";

import { AddressChannels, AddressUsages, getCategoryIcon } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { AddressChannel, AddressModel, AddressUsage } from "@bk2/shared-models";
import { SvgIconPipe } from "@bk2/shared-pipes";
import { EmptyListComponent } from "@bk2/shared-ui";

import { FavoriteColorPipe, FormatAddressPipe } from "@bk2/subject-address-util";

import { createActionSheetButton, createActionSheetOptions } from "@bk2/shared-util-angular";
import { coerceBoolean, hasRole } from "@bk2/shared-util-core";
import { AddressAccordionStore } from "libs/subject/address/feature/src/lib/addresses-accordion.store";

@Component({
  selector: 'bk-addresses-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe,
    FavoriteColorPipe, FormatAddressPipe, SvgIconPipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonList
  ],
  styles: [`
    ion-icon {
      padding-right: 5px;
    }
  `],
  providers: [AddressAccordionStore],
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
      @if(description(); as description) {
        <ion-item lines="none">
          <ion-label>{{ description | translate | async }}</ion-label>
        </ion-item>
      }  
      @if(addresses().length === 0) {
        <bk-empty-list message="@general.noData.addresses" />
      } @else {
        <ion-list lines="inset">
          @for(address of addresses(); track $index) {
            <ion-item (click)="showActions(address)">
              <ion-label>
                <ion-icon src="{{ 'star' | svgIcon }}" color="{{ address.isFavorite | favoriteColor }}" />
                @if(address.isCc) {
                  <ion-icon src="{{ 'cc-circle' | svgIcon }}" />
                }
                @if(address.isValidated) {
                  <ion-icon src="{{ 'shield-checkmark' | svgIcon }}" />
                }
                <ion-icon [src]="getChannelIcon(address.channelType) | svgIcon" />
                <span class="ion-hide-md-down"> {{ getAddressUsage(address) | translate | async }}</span>
                {{ address | formatAddress }}
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class AddressesAccordionComponent {
  protected readonly addressAccordionStore = inject(AddressAccordionStore);
  private readonly actionSheetController = inject(ActionSheetController);

  // inputs
  public parentKey = input.required<string>(); // modelType.key of the parent model of the addresses person or org
  public description = input<string>(); // description shown in the accordion header
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public color = input('light'); // color of the accordion
  public label = input('@subject.address.plural'); // label of the accordion

  // signals
  protected addresses = computed(() => this.addressAccordionStore.addresses() ?? []);
  private currentUser = computed(() => this.addressAccordionStore.currentUser());

  // passing constants
  private imgixBaseUrl = this.addressAccordionStore.imgixBaseUrl();
  protected addressChannel = AddressChannel; 

  constructor() {
    effect(() => {
      this.addressAccordionStore.setParentKey(this.parentKey());
    });
  }

  protected getChannelIcon(channelType: AddressChannel): string {
    return getCategoryIcon(AddressChannels, channelType);
  }

  protected getAddressUsage(address: AddressModel): string {
    if (address.usageType === AddressUsage.Custom) {
      return address.usageLabel;
    } else {
      return '@' + AddressUsages[address.usageType].i18nBase + '.label';
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on an address. Only actions are shown, the user has permission for.
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
   * @param address 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, address: AddressModel): void {
    if (hasRole('admin', this.currentUser()) && !this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('address.delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('address.copy', this.imgixBaseUrl, 'copy'));
    actionSheetOptions.buttons.push(createActionSheetButton('address.view', this.imgixBaseUrl, 'eye-on'));
    if (!this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('address.edit', this.imgixBaseUrl, 'create_edit'));
    }
    switch(address.channelType) {
      case AddressChannel.BankAccount:
        actionSheetOptions.buttons.push(createActionSheetButton('address.iban.view', this.imgixBaseUrl, 'qrcode'));
        if (!this.isReadOnly()) {
          actionSheetOptions.buttons.push(createActionSheetButton('address.iban.upload', this.imgixBaseUrl, 'qrcode'));
        }
        break;
      case AddressChannel.Email:
        actionSheetOptions.buttons.push(createActionSheetButton('address.email.send', this.imgixBaseUrl, 'email'));
        break;
      case AddressChannel.Phone:
        actionSheetOptions.buttons.push(createActionSheetButton('address.phone.call', this.imgixBaseUrl, 'tel'));
        break;
      case AddressChannel.Postal:
        actionSheetOptions.buttons.push(createActionSheetButton('address.postal.view', this.imgixBaseUrl, 'location'));
        break;
      case AddressChannel.Web:
        actionSheetOptions.buttons.push(createActionSheetButton('address.web.open', this.imgixBaseUrl, 'link'));
        break;
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
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
          await this.addressAccordionStore.delete(address, this.isReadOnly());
          break;
        case 'address.copy':
          await this.addressAccordionStore.copy(address);
          break;
        case 'address.view':
          await this.addressAccordionStore.edit(address, true);
          break;
        case 'address.edit':
          await this.addressAccordionStore.edit(address, this.isReadOnly());
          break;
        case 'address.iban.view':
          await this.addressAccordionStore.showQrEzs(address);
          break;
        case 'address.iban.upload':
          await this.addressAccordionStore.uploadQrEzs(address);
          break;
        case 'address.email.send':
          await this.addressAccordionStore.sendEmail(address.email);
          break;
        case 'address.phone.call':
          await this.addressAccordionStore.call(address.phone);
          break;
        case 'address.postal.view':
          await this.addressAccordionStore.showPostalAddress(address);
          break;
        case 'address.web.open':
          await this.addressAccordionStore.openUrl(address);
          break;
      }
    }
  }

  public async add(): Promise<void> {
    this.addressAccordionStore.add(this.isReadOnly());
  }
}
