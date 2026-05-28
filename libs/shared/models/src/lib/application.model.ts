import {
  DEFAULT_COUNTRY, DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX,
  DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_TENANTS
} from '@bk2/shared-constants';
import { BkModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';

export class ApplicationModel implements BkModel, SearchableModel, TaggedModel {
  // base
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  // applicant — person data
  public firstName = DEFAULT_NAME;
  public lastName = DEFAULT_NAME;
  public gender: 'male' | 'female' = DEFAULT_GENDER as 'male' | 'female';
  public dateOfBirth = DEFAULT_DATE;
  public ssnId = DEFAULT_ID;

  // applicant — contact channels
  public email = DEFAULT_EMAIL;
  public phone = DEFAULT_PHONE;

  // applicant — address
  public streetName = DEFAULT_NAME;
  public streetNumber = '';
  public zipCode = '';
  public city = '';
  public countryCode = DEFAULT_COUNTRY;

  // parent contact — youth only
  public parentFirstName = DEFAULT_NAME;
  public parentLastName = DEFAULT_NAME;
  public parentEmail = DEFAULT_EMAIL;
  public parentPhone = DEFAULT_PHONE;

  // application
  public applicationAs: ApplicationKind = 'adult';
  public state: ApplicationState = 'applied';

  // workflow bookkeeping
  public submittedAt = '';
  public reviewedAt = '';
  public closedAt = '';
  public reviewer: AvatarInfo | undefined;
  public closeReason = '';
  public personKey = DEFAULT_KEY;
  public taskKey = DEFAULT_KEY;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ApplicationCollection = 'applications';
export const ApplicationModelName = 'application';

export type ApplicationState =
  | 'applied'
  | 'reviewing'
  | 'closed.approved'
  | 'closed.cancelled'
  | 'closed.denied';

export const APPLICATION_STATE_VALUES: ApplicationState[] = [
  'applied', 'reviewing', 'closed.approved', 'closed.cancelled', 'closed.denied'
];

export type ApplicationKind = 'youth' | 'adult' | 'transfer';
export const APPLICATION_KIND_VALUES: ApplicationKind[] = ['youth', 'adult', 'transfer'];
