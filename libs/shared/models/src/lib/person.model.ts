import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AddressableModel, OkrModel, SearchableModel, TaggedModel } from './base.model';
import { PrivacyUsage } from './enums/privacy-usage.enum';

export class PersonModel implements OkrModel, AddressableModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;
  public firstName = DEFAULT_NAME;
  public lastName = DEFAULT_NAME;
  public gender = DEFAULT_GENDER;
  // ssnId/dateOfBirth/favEmail/favPhone were stripped in privacy 1.19 Phase 4:
  // ssn + dob live only in the addresses vault; contact data is served by the
  // address-directory projection.
  public dateOfDeath = DEFAULT_DATE;
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
