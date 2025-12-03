import { DEFAULT_ACCOUNT_NAME, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class AccountModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public description = DEFAULT_NOTES;
  public id = DEFAULT_ID; // account number, e.g. iban
  public type = DEFAULT_ACCOUNT_NAME;
  public label = DEFAULT_LABEL; // label for custom account types

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const AccountCollection = 'accounts';
export const AccountModelName = 'account';
