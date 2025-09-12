import { BkModel, SearchableModel, TaggedModel } from './base.model';
import { GenderType } from './enums/gender-type.enum';
import { ModelType } from './enums/model-type.enum';
import { OrgType } from './enums/org-type.enum';
import { Periodicity } from './enums/periodicity.enum';

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
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public tags = '';
  public notes = '';

  // member
  public memberKey = '';
  public memberName1 = ''; // e.g. firstname of person
  public memberName2 = ''; // e.g. lastname or company name
  public memberModelType: ModelType = ModelType.Person;
  public memberType?: GenderType | OrgType;
  public memberNickName = '';
  public memberAbbreviation = '';
  public memberDateOfBirth = '';
  public memberDateOfDeath = '';
  public memberZipCode = '';
  public memberBexioId = '';

  // object = the membership organization
  public orgKey = '';
  public orgName = '';

  // membership
  public memberId = '';
  public dateOfEntry = '';
  public dateOfExit = '';
  public membershipCategory = 'active';
  public membershipState = 'active';
  public orgFunction = '';

  public priority?: number; // timely sequence of the same membership e.g. J -> A -> P
  public relLog = ''; // log of changes e.g.  20200715:K->A->P
  public relIsLast = true; // is this the last membership of the same kind ? (building a linked list of memberships, ordered by priority)

  public price = 0; // overwrites the default membership price MembershipCategories[_membership.membershipCategory].price
  public currency = 'CHF';
  public periodicity = Periodicity.Yearly;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const MembershipCollection = 'memberships3';
