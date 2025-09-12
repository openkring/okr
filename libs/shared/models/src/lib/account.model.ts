import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { AccountType } from './enums/account-type.enum';

export class AccountModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public name = '';
  public index = '';
  public tags = '';
  public description = '';
  public id = ''; // account number, e.g. iban
  public type?: AccountType;
  public label = ''; // label for custom account types

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const AccountCollection = 'accounts';
