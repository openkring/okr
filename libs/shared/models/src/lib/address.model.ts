import { DEFAULT_EMAIL, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_URL } from '@bk2/shared-constants';
import { BkModel, TaggedModel } from './base.model';
import { AddressChannel } from './enums/address-channel.enum';
import { AddressUsage } from './enums/address-usage.enum';

export class AddressModel implements BkModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public channelType = AddressChannel.Phone;
  public channelLabel = DEFAULT_LABEL; // optional label for custom channel types
  public usageType = AddressUsage.Home;
  public usageLabel = DEFAULT_LABEL; // optional label for custom address types
  public email = DEFAULT_EMAIL;
  public phone = DEFAULT_PHONE;
  public iban = '';
  public streetName = DEFAULT_NAME;
  public streetNumber = '';
  public addressValue2 = ''; // optional address, e.g. c/o, company
  public zipCode = '';
  public city = '';
  public countryCode = '';
  public url = DEFAULT_URL; // for BankAccount: ezs url; url is also used for all website addresses including social media links or ids

  public isFavorite = false;
  public isCc = false;
  public isValidated = false;
  public isArchived = false;

  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public tenants: string[] = DEFAULT_TENANTS;
  public index = DEFAULT_INDEX; // for search
  public parentKey = DEFAULT_KEY; // modelType.key, e.g. org.key for orgs or person.key for persons

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const AddressCollection = 'addresses';
export const AddressModelName = 'address';
