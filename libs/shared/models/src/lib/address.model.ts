import { DEFAULT_ADDRESS_CHANNEL, DEFAULT_ADDRESS_USAGE, DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_URL } from '@okr/shared-constants';
import { OkrModel, TaggedModel } from './base.model';

export class AddressModel implements OkrModel, TaggedModel {
  public okey = DEFAULT_KEY;

  // new
  public addressChannel = DEFAULT_ADDRESS_CHANNEL;
  public addressChannelLabel = DEFAULT_LABEL; // optional label for custom address channel
  public addressUsage = DEFAULT_ADDRESS_USAGE;
  public addressUsageLabel = DEFAULT_LABEL; // optional label for custom address usage

  public email = DEFAULT_EMAIL;
  public phone = DEFAULT_PHONE;
  public iban = '';
  // sensitive scalar channels (spec 1.19: addresses are the PII vault) —
  // one doc per person, no favorite/label semantics; floors in CHANNEL_SENSITIVITY_FLOOR
  public ssn = '';            // addressChannel 'ssn': the AHV number (formatAhv Electronic)
  public dob = DEFAULT_DATE;  // addressChannel 'dob': date of birth (StoreDate YYYYMMDD)
  public dod = DEFAULT_DATE;  // addressChannel 'dod': date of death (StoreDate YYYYMMDD)
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
