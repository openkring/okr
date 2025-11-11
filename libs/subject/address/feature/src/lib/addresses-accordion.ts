import { AsyncPipe } from "@angular/common";
import { Component, inject, input, model, output } from "@angular/core";
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonItem, IonLabel, IonList, ModalController } from "@ionic/angular/standalone";

import { AddressChannels, AddressUsages, getCategoryIcon } from "@bk2/shared-categories";
import { AppStore } from "@bk2/shared-feature";
import { TranslatePipe } from "@bk2/shared-i18n";
import { AddressChannel, AddressModel, AddressUsage } from "@bk2/shared-models";
import { SvgIconPipe } from "@bk2/shared-pipes";
import { EmptyListComponent } from "@bk2/shared-ui";

import { AddressService } from "@bk2/subject-address-data-access";
import { FavoriteColorPipe, FavoriteIconPipe, FormatAddressPipe } from "@bk2/subject-address-util";

import { AddressModalsService } from "./address-modals.service";
import { createActionSheetButton, createActionSheetOptions } from "@bk2/shared-util-angular";
import { hasRole } from "@bk2/shared-util-core";

@Component({
  selector: 'bk-addresses-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe,
    FavoriteColorPipe, FavoriteIconPipe, FormatAddressPipe, SvgIconPipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonList
  ],
  styles: [`
    ion-icon {
      padding-right: 5px;
    }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="addresses">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ label() | translate | async }}</ion-label>
        @if(readOnly() === false) {
          <ion-button fill="clear" (click)="add()" size="default">
            <ion-icon color="secondary" slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
          </ion-button>
        }
    </ion-item>
    <div slot="content">
      @if(addresses().length === 0) {
        <bk-empty-list message="@general.noData.addresses" />
      } @else {
        <ion-list lines="inset">
          @for(address of addresses(); track $index) {
            <ion-item (click)="showActions(address)">
              <ion-label>
                <ion-icon src="{{ address.isFavorite | favoriteIcon }}" color="{{ address.isFavorite | favoriteColor }}" />
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
  protected readonly modalController = inject(ModalController);
  private actionSheetController = inject(ActionSheetController);
  public readonly addressService = inject(AddressService);
  private readonly addressModalsService = inject(AddressModalsService);
  private readonly appStore = inject(AppStore);

  public addresses = model.required<AddressModel[]>(); // the addresses shown in the accordion
  public parentKey = input.required<string>(); // the parent key of the addresses
  public parentModelType = input.required<'person' | 'org'>(); // the parent model type of the addresses
  public addressesChanged = output(); // event emitted when the addresses have changed
  private imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  // we need to solve the access with an input parameter (instead of using the authorizationService),
  // in order to support the profile use case (where the current user is allowed to edit addresses even if she does not have memberAdmin role)
  public readOnly = input(true); // if true, the addresses are read-only
  public color = input('light'); // color of the accordion
  public label = input('@subject.address.plural'); // label of the accordion
  protected addressChannel = AddressChannel; 

  public async toggleFavorite(address: AddressModel): Promise<void> {
    if (this.readOnly() === false) {
      await this.addressService.toggleFavorite(address, this.appStore.currentUser());
    }
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
    if (hasRole('admin', this.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('copy', this.imgixBaseUrl, 'copy'));
    if (hasRole('memberAdmin', this.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
    }
    switch(address.channelType) {
      case AddressChannel.BankAccount:
        actionSheetOptions.buttons.push(createActionSheetButton('show', this.imgixBaseUrl, 'qrcode'));
        actionSheetOptions.buttons.push(createActionSheetButton('upload', this.imgixBaseUrl, 'qrcode'));
        break;
      case AddressChannel.Email:
        actionSheetOptions.buttons.push(createActionSheetButton('send', this.imgixBaseUrl, 'email'));
        break;
      case AddressChannel.Phone:
        actionSheetOptions.buttons.push(createActionSheetButton('call', this.imgixBaseUrl, 'tel'));
        break;
      case AddressChannel.Postal:
        actionSheetOptions.buttons.push(createActionSheetButton('show', this.imgixBaseUrl, 'location'));
        break;
      case AddressChannel.Web:
        actionSheetOptions.buttons.push(createActionSheetButton('show', this.imgixBaseUrl, 'link'));
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
      switch (data.action) {
        case 'delete':
          await this.addressService.delete(address, this.appStore.currentUser());
          this.addressesChanged.emit();
          break;
        case 'copy':
          await this.addressService.copy(address);
          break;
        case 'edit':
          await this.addressModalsService.edit(address);
          this.addressesChanged.emit();
          break;
        case 'upload':
          const url = await this.addressModalsService.uploadEzs(address);
          if (url) {
            address.url = url;
            await this.addressService.update(address, this.appStore.currentUser());
          }
          break;
        case 'show':
        case 'send':
        case 'call':
          await this.addressModalsService.use(address);
          break;
      }
    }
  }

  public async add(): Promise<void> {
    const newAddress = new AddressModel(this.addressModalsService.tenantId);
    newAddress.parentKey = this.parentModelType() + '.' + this.parentKey();
    await this.addressModalsService.edit(newAddress);
    this.addressesChanged.emit();
  }
}
