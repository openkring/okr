import { BkModel, TaggedModel } from './base.model';
import { AddressChannel } from './enums/address-channel.enum';
import { AddressUsage } from './enums/address-usage.enum';

export class AddressModel implements BkModel, TaggedModel {
  public bkey = '';
  public channelType = AddressChannel.Phone;
  public channelLabel = ''; // optional label for custom channel types
  public usageType = AddressUsage.Home;
  public usageLabel = ''; // optional label for custom address types
  public email = '';
  public phone = '';
  public streetName = '';
  public streetNumber = '';
  public addressValue2 = ''; // optional address, e.g. c/o, company
  public zipCode = '';
  public city = '';
  public countryCode = '';
  public url = ''; // for BankAccount: ezs url

  public isFavorite = false;
  public isCc = false;
  public isValidated = false;
  public isArchived = false;

  public tags = '';
  public description = '';

  public tenants: string[] = [];
  public index = ''; // for search
  public parentKey = ''; // modelType.key, e.g. 14.key for orgs or 17.key for persons

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const AddressCollection = 'addresses';
