import { DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { AddressableModel, BkModel, SearchableModel, TaggedModel } from './base.model';
import { PrivacyUsage } from './enums/privacy-usage.enum';

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
  public favZipCode = '';
  public bexioId = DEFAULT_ID;

  // privacy preferences: how the person wants their sensitive attributes shared.
  // Read source for AppStore.getPersonPrivacySettings (persons are tenant-readable,
  // users are not). Edited via profile/admin and mirrored onto the person on save.
  public usageImages = PrivacyUsage.Public;
  public usageDateOfBirth = PrivacyUsage.Restricted;
  public usagePostalAddress = PrivacyUsage.Restricted;
  public usageEmail = PrivacyUsage.Restricted;
  public usagePhone = PrivacyUsage.Restricted;
  public usageName = PrivacyUsage.Restricted;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const PersonCollection = 'persons';
export const PersonModelName = 'person';
