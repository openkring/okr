import { DEFAULT_DATE, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_MCAT, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';

/**
 * A list of all active or passive member of organization scs (it is scs-specific)
 * to prepare the yearly membership invoices.
 * The entries of this list are deleted when creating the invoice in Bexio (upload of the data to Bexio)
 */
export class ScsMemberFeesModel implements BkModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public member: AvatarInfo | undefined;
  public memberDateOfBirth = DEFAULT_DATE;
  public memberBexioId = DEFAULT_ID;
  public dateOfEntry = DEFAULT_DATE;
  public category = DEFAULT_MCAT;

  public jb = 0;
  public srv = 0;
  public bev  = 0;
  public entryFee = 0;
  public locker = 0;
  public hallenTraining = 0;
  public skiff = 0;
  public skiffInsurance = 0;
  public rebate = 0;
  public rebateReason = '';

  public state: INVOICE_STATE = 'initial';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ScsMemberFeesCollection = 'scs-memberfees';
export const ScsMemberFeesModelName = 'scs-member-fee';

export type INVOICE_STATE = 'initial' | 'review' | 'ready' | 'uploaded' | 'sent';
export const INVOICE_STATE_VALUES = ['initial', 'review', 'ready', 'uploaded', 'sent'] as const satisfies INVOICE_STATE[];
