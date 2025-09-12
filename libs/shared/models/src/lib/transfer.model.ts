import { AvatarInfo } from './avatar-info';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { Periodicity } from './enums/periodicity.enum';
import { ResourceType } from './enums/resource-type.enum';
import { RowingBoatType } from './enums/rowing-boat-type.enum';
import { TransferState } from './enums/transfer-state.enum';
import { TransferType } from './enums/transfer-type.enum';
import { ResourceInfo } from './resource.model';

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
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public name = ''; // e.g. the reason for the transfer, e.g. "xmas" for a gift
  public index = '';
  public tags = '';
  public notes = '';

  public subjects: AvatarInfo[] = []; // list of subjects, e.g. person or org or account
  public objects: AvatarInfo[] = []; // list of objects, e.g. person or org or account
  public resource: ResourceInfo = { key: '', name: '', type: ResourceType.RowingBoat, subType: RowingBoatType.b1x }; // the resource that is transferred

  // transfer
  public dateOfTransfer = '';
  public type?: TransferType;
  public state?: TransferState; // e.g. active, pending, cancelled
  public label = ''; // a label for a custom transfer type

  // price
  public price = 0;
  public currency = 'CHF';
  public periodicity = Periodicity.Once;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const TransferCollection = 'transfers';
