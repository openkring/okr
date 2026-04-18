import { DEFAULT_ACCOUNT_NAME, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export class AccountModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;
  public id = DEFAULT_ID; // account number, e.g. iban
  public parentId = DEFAULT_ID; // to build a hierarchical structure of accounts

  // for accounting, use root, group, leaf to build a chart of accounts (Kontoplan)
  // root is to have several different chart of accounts (e.g. custom and bexio, or scs and gss)
  // leaf are the accounts where your booking statements go into
  // group are grouping leafs or other groups together (e.g. assets, liabilities, earings, etc.)
  public type = DEFAULT_ACCOUNT_NAME; // CategoryList: account_type
  public label = DEFAULT_LABEL; // label for custom account types

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const AccountCollection = 'accounts';
export const AccountModelName = 'account';

