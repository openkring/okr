import { AsyncPipe } from "@angular/common";
import { Component, inject, input, model, output } from "@angular/core";
import { AddressService } from "@bk2/address/data";
import { FavoriteColorPipe, FavoriteIconPipe, FormatAddressPipe } from "@bk2/address/util";
import { AppStore } from "@bk2/auth/feature";
import { AddressChannels, AddressUsages, getCategoryIcon } from "@bk2/shared/categories";
import { ENV } from "@bk2/shared/config";
import { TranslatePipe } from "@bk2/shared/i18n";
import { AddressChannel, AddressModel, AddressUsage, ModelType } from "@bk2/shared/models";
import { SvgIconPipe } from "@bk2/shared/pipes";
import { EmptyListComponent } from "@bk2/shared/ui";
import { IonAccordion, IonButton, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, ModalController } from "@ionic/angular/standalone";

@Component({
  selector: 'bk-addresses-accordion',
  imports: [ 
    TranslatePipe, AsyncPipe,
    FavoriteColorPipe, FavoriteIconPipe, FormatAddressPipe, SvgIconPipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon,  
    IonItemSliding, IonItemOptions, IonItemOption, IonList
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
          <ion-button fill="clear" (click)="edit()" size="default">
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
            <ion-item-sliding #slidingItem>
              <ion-item (click)="addressService.use(address)">
                <ion-label>
                  <ion-icon src="{{ address.isFavorite | favoriteIcon }}" color="{{ address.isFavorite | favoriteColor }}" />
                  @if(address.isCc) {
                    <ion-icon src="{{ 'cc-circle' | svgIcon }}" />
                  }
                  @if(address.isValidated) {
                    <ion-icon src="{{ 'shield-checkmark' | svgIcon }}" />
                  }
                  <ion-icon [src]="getChannelIcon(address.channelType) | svgIcon" />
                  <!-- <ion-icon [src]="address.channelType | channelIcon" /> -->
                  <span class="ion-hide-md-down"> {{ getAddressUsage(address) | translate | async }}</span>
                </ion-label>
                <ion-label>
                  {{ address.addressValue | formatAddress:address.addressValue2:address.zipCode:address.city:address.channelType }}
                </ion-label>
              </ion-item>
              @if(readOnly() === false) {
                <ion-item-options side="end">
                  <ion-item-option color="danger" (click)="delete(slidingItem, address)"><ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" /></ion-item-option>
                  <ion-item-option color="light" (click)="copy(slidingItem, address)"><ion-icon slot="icon-only" src="{{'copy' | svgIcon }}" /></ion-item-option>
                  <ion-item-option color="primary" (click)="edit(slidingItem, address)"><ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" /></ion-item-option>
                  @if(address.channelType === addressChannel.BankAccount) {
                    <ion-item-option color="light" (click)="uploadEzs(slidingItem, address)"><ion-icon slot="icon-only" src="{{'qrcode' | svgIcon }}" /></ion-item-option>
                  }
                </ion-item-options>
              }
            </ion-item-sliding>
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class AddressesAccordionComponent {
  public readonly appStore = inject(AppStore);
  protected readonly modalController = inject(ModalController);
  public readonly addressService = inject(AddressService);
  private readonly env = inject(ENV);

  public addresses = model.required<AddressModel[]>(); // the addresses shown in the accordion
  public parentKey = input.required<string>(); // the parent key of the addresses
  public parentModelType = input.required<ModelType>(); // the parent model type of the addresses
  public addressesChanged = output(); // event emitted when the addresses have changed

  // we need to solve the access with an input parameter (instead of using the authorizationService),
  // in order to support the profile use case (where the current user is allowed to edit addresses even if she does not have memberAdmin role)
  public readOnly = input(true); // if true, the addresses are read-only
  public color = input('light'); // color of the accordion
  public label = input('@subject.address.plural'); // label of the accordion
  protected addressChannel = AddressChannel; 

  public async toggleFavorite(address: AddressModel): Promise<void> {
    if (this.readOnly() === false) {
      await this.addressService.toggleFavorite(address);
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

  public async delete(slidingItem?: IonItemSliding, address?: AddressModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (address) await this.addressService.delete(address);
    this.addressesChanged.emit();
  }

  public async copy(slidingItem?: IonItemSliding, address?: AddressModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (address) await this.addressService.copy(address);
  }

  public async edit(slidingItem?: IonItemSliding, address?: AddressModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (address) await this.addressService.edit(address, this.appStore.currentUser());
    else {
      const _newAddress = new AddressModel(this.env.owner.tenantId);
      _newAddress.parentKey = this.parentModelType() + '.' + this.parentKey();
      await this.addressService.edit(_newAddress, this.appStore.currentUser());
    }
    this.addressesChanged.emit();
  }

  public async uploadEzs(slidingItem?: IonItemSliding, address?: AddressModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (address) {
      const _url = await this.addressService.uploadEzs(address);
      if (_url) {
        address.url = _url;
        await this.addressService.update(address);
      }
    }
  }
}
