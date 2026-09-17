import { DEFAULT_DATE, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_MCAT, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';

/**
 * One line of a member's fee. Mirrors the subset of `InvoicePositionModel` a fee needs, so a
 * position materialises into a real invoice position on posting without a mapping table.
 */
export interface MemberFeePosition {
  key: string; // stable id from the schedule rule, e.g. 'jb'
  usage: string; // invoice_position_usage
  type: string; // invoice_position_type ('fix' | 'rebate' | …)
  label: string; // grid column header and invoice position name
  amount: number;
  accountKey: string; // revenue account (AccountModel) — the NATIVE posting path
  vatCodeKey: string;
  // The Bexio account id of the same revenue account. A separate field on purpose: `accountKey`
  // is an AccountModel okey and is not numeric, so the Bexio upload cannot derive an account id
  // from it. The two backends identify accounts differently; conflating them uploaded every
  // position with account_id 0.
  bexioAccountId?: number;
}

/**
 * A list of all active or passive member of organization scs (it is scs-specific)
 * to prepare the yearly membership invoices.
 * The entries of this list are deleted when creating the invoice in Bexio (upload of the data to Bexio)
 */
export class MemberFeeModel implements OkrModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public member: AvatarInfo | undefined;
  public memberBirthYear = ''; // YYYY — degraded-precision dob replica (spec 1.19); memberDateOfBirth was stripped in Phase 4
  public memberBexioId = DEFAULT_ID;
  public dateOfEntry = DEFAULT_DATE;
  public category = DEFAULT_MCAT;

  public positions: MemberFeePosition[] = [];
  public templateId = '';
  public invoiceBexioId = ''; // set when uploaded to Bexio (accountingBackend 'bexio')
  public invoiceKey = '';     // ref to InvoiceModel.okey, set when posted natively (accountingBackend != 'bexio')

  public state: INVOICE_STATE = 'initial';

  // Stamped (StoreDateTime) when a data-subject erasure pseudonymized this record
  // (privacy 1.19, D-P5-6): the name fields and the person link are overwritten, the
  // amounts, dates and document references stay. '' = never anonymized.
  public anonymizedAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const MemberFeeCollection = 'member-fees';

/**
 * The collection this feature lived in before it was generalized out of its scs shape
 * (`MemberFeeModel` was `ScsMemberFeesModel`). Every historical document still sits here until
 * the owner drops the collection deliberately, so it stays wired into the privacy machinery
 * (SUBJECT_DATA_MAP, the privacy report, firestore.rules) and is the READ side of
 * `migrateMemberFees`, which copies id-for-id into `MemberFeeCollection`. Never inline the
 * literal: a privacy guard test asserts every mapped collection resolves to an exported constant.
 */
export const LegacyMemberFeeCollection = 'scs-memberfees';
export const MemberFeeModelName = 'member-fee';

export type INVOICE_STATE = 'initial' | 'review' | 'ready' | 'uploaded' | 'invoiced' | 'sent' | 'paid' | 'cancelled';
export const INVOICE_STATE_VALUES = ['initial', 'review', 'ready', 'uploaded', 'invoiced', 'sent', 'paid', 'cancelled'] as const satisfies INVOICE_STATE[];
