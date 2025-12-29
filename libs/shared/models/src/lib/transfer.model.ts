import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_PRICE, DEFAULT_RBOAT_TYPE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TRANSFER_STATE, DEFAULT_TRANSFER_TYPE } from '@bk2/shared-constants';

import { AvatarInfo } from './avatar-info';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * A transfer of ownership or membership from one entity to another.
 *
 * Person|Org|Account    buysFrom|sellsTo|withdraw|lend|deposit       Person|Org|Account                         what: Resource
 * TransferType: Sale/Purchase, Gift, Inheritance, ...
 *
 * Examples:
 * - accounting (Buchhaltung):  soll/haben transaction , type: Aktiv/Passiv/Aufwand/Ertrag, subType: UV/AV/EK/FK etc.
 * - purchase of a resource (e.g. rowing boat)
 * - inventory of gifts
 * - inheritance
 * - withdrawal/deposit from/to bank account
 */
export class TransferModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME; // e.g. the reason for the transfer, e.g. "xmas" for a gift
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public subjects: AvatarInfo[] = []; // list of subjects, e.g. person or org or account
  public objects: AvatarInfo[] = []; // list of objects, e.g. person or org or account
  public resource: AvatarInfo = {   // the resource that is transferred
    key: '',
    name1: DEFAULT_NAME,
    name2: DEFAULT_NAME,
    modelType: 'resource',
    type: DEFAULT_RESOURCE_TYPE,
    subType: DEFAULT_RBOAT_TYPE,
    label: ''
  };

  // transfer
  public dateOfTransfer = DEFAULT_DATE;
  public type = DEFAULT_TRANSFER_TYPE;
  public state = DEFAULT_TRANSFER_STATE; // e.g. active, pending, cancelled
  public label = DEFAULT_LABEL; // a label for a custom transfer type

  // price
  public price = DEFAULT_PRICE;
  public currency = DEFAULT_CURRENCY;
  public periodicity = DEFAULT_PERIODICITY;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TransferCollection = 'transfers';
export const TransferModelName = 'transfer';
