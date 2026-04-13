import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_MCAT, DEFAULT_MSTATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, SearchableModel, TaggedModel } from './base.model';

/**
 * A membership of a person or organization in a group or organization.
 *
 * Person|Org|Group      isMemberOf/hasMember                 Org|Group
 *
 * MemberType: Active, Passive, Honorary, Junior, Candidate, Double
 * Membership can build Hierarchies or OrgCharts: org -> org -> group -> person
 *
 * Examples:
 * - membership in a club
 */
export class MembershipModel implements BkModel, SearchableModel, TaggedModel {
  // base
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  // member (we deliberately do not use a nested object here to simplify queries)
  public memberKey = DEFAULT_KEY;
  public memberName1 = DEFAULT_NAME; // e.g. firstname of person
  public memberName2 = DEFAULT_NAME; // e.g. lastname or company name
  public memberModelType: 'person' | 'org' | 'group' = 'person';
  public memberType = DEFAULT_GENDER;

  public memberNickName = DEFAULT_NAME;
  public memberAbbreviation = '';
  public memberDateOfBirth = DEFAULT_DATE;
  public memberDateOfDeath = DEFAULT_DATE;
  public memberZipCode = '';
  public memberBexioId = DEFAULT_ID;
  public memberId = DEFAULT_ID;

  // object = the membership organization
  public orgKey = DEFAULT_KEY;
  public orgName = DEFAULT_NAME;
  public orgModelType: 'org' | 'group' = 'org';

  // membership
  public dateOfEntry = DEFAULT_DATE;
  public dateOfExit = DEFAULT_DATE;
  public category = DEFAULT_MCAT;
  public state = DEFAULT_MSTATE;
  public orgFunction = '';

  public order = 1; // timely sequence of the same membership e.g. J -> A -> P
  public relLog = ''; // log of changes e.g.  20200715:K->A->P
  public relIsLast = true; // is this the last membership of the same kind ? (building a linked list of memberships, ordered by priority)

  public rebate = 0;
  public rebateReason: REBATE_REASON = 'none';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const MembershipCollection = 'memberships';
export const MembershipModelName = 'membership';

export type REBATE_REASON = 'edu' | 'family' | 'custom' | 'hardship' | 'support' | 'none';
export const REBATE_REASON_VALUES = ['edu', 'family', 'custom', 'hardship', 'support'] as const satisfies REBATE_REASON[];
