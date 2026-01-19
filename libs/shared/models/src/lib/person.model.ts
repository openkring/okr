import { DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { AddressableModel, BkModel, SearchableModel, TaggedModel } from './base.model';

export class PersonModel implements BkModel, AddressableModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;
  public firstName = DEFAULT_NAME;
  public lastName = DEFAULT_NAME;
  public gender = DEFAULT_GENDER;
  public ssnId = DEFAULT_ID; // social security number, in Switzerland: AHV Number in electronic format
  public dateOfBirth = DEFAULT_DATE;
  public dateOfDeath = DEFAULT_DATE;
  public favEmail = DEFAULT_EMAIL;
  public favPhone = DEFAULT_PHONE;
  public favStreetName = DEFAULT_NAME;
  public favStreetNumber = '';
  public favZipCode = '';
  public favCity = '';
  public favCountryCode = '';
  public bexioId = DEFAULT_ID;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const PersonCollection = 'persons';
export const PersonModelName = 'person';
