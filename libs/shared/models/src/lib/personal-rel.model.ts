import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERSONAL_REL, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, SearchableModel, TaggedModel } from './base.model';

/**
 * A personal relationship between two persons.
 *
 * Person|Person      isRelatedTo|isMarriedTo|isFriendOf|isColleagueOf|isFamilyOf|isParentOf|isChildOf|isSiblingOf|isCousinOf|isGrandparentOf|isGrandchildOf|isAuntOf|isUncleOf|isNephewOf|isNieceOf|isGodparentOf|isGodchildOf|isSponsorOf|isSponseeOf|isMentorOf|isMenteeOf|isTeacherOf|isStudentOf|isPatientOf|isDoctorOf|isNurseOf|isTherapistOf|isClientOf|isCustomerOf|isSupplierOf|isVendorOf|isPartnerOf|isSpouseOf|isExSpouseOf|isExPartnerOf|isExFriendOf|isExColleagueOf|isExFamilyOf|isExParentOf|isExChildOf|isExSiblingOf|isExCousinOf|isExGrandparentOf|isExGrandchildOf|isExAuntOf|isExUncleOf|isExNephewOf|isExNieceOf|isExGodparentOf|isExGodchildOf|isExSponsorOf|isExSponseeOf|isExMentorOf|isExMenteeOf|isExTeacherOf|isExStudentOf|isExPatientOf|isExDoctorOf|isExNurseOf|isExTherapistOf|isExClientOf|isExCustomerOf|isExSupplierOf|isExVendorOf|isExPartnerOf|isExSpouseOf|isExExSpouseOf|isExExPartnerOf|isExExFriendOf|isExExColleagueOf|isExExFamilyOf|isExExParentOf|isExExChildOf|isExExSiblingOf|isExExCousinOf|isExExGrandparentOf|isExExGrandchildOf|isExExAuntOf|isExExUncleOf|isExExNephewOf|isExExNieceOf|isExExGodparentOf|isExExGodchildOf|isExExSponsorOf|isExExSponseeOf|isExExMentorOf|isExExMenteeOf|isExExTeacherOf
 *
 * PersonalRelType: Marriage, Friendship, Known, Family, Parent/Child, Sibling, Godparent/Godchild, Sponsorship: Sponsor/Sponsee, Mentorship: Mentor/Mentee, Teacher/Student, Doctor/Patient, Therapist, Client,
 * other: Cousin, Grandparent, Grandchild, Aunt, Uncle, Nephew, Niece,
 *
 * Examples:
 * - marriage
 * - build ancestry graph
 */
export class PersonalRelModel implements BkModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  // person 1
  public subjectKey = DEFAULT_KEY;
  public subjectFirstName = DEFAULT_NAME;
  public subjectLastName = DEFAULT_NAME;
  public subjectGender = DEFAULT_GENDER;

  // person 2
  public objectKey = DEFAULT_KEY;
  public objectFirstName = DEFAULT_NAME;
  public objectLastName = DEFAULT_NAME;
  public objectGender = DEFAULT_GENDER;

  public type = DEFAULT_PERSONAL_REL;
  public label = DEFAULT_LABEL;
  public validFrom = DEFAULT_DATE;
  public validTo = DEFAULT_DATE;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const PersonalRelCollection = 'personal-rels';
