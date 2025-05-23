import { BkModel, SearchableModel, TaggedModel } from "./base.model";
import { GenderType } from "./enums/gender-type.enum";
import { PersonalRelType } from "./enums/personal-rel-type.enum";

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
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public tags = '';
  public notes = ''; 

  // person 1
  public subjectKey = '';
  public subjectFirstName = '';
  public subjectLastName = '';
  public subjectGender?: GenderType;

  // person 2
  public objectKey = '';
  public objectFirstName = ''; 
  public objectLastName = ''; 
  public objectGender?: GenderType;

  public type?: PersonalRelType;
  public label = '';             
  public validFrom = '';
  public validTo = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const PersonalRelCollection = 'personal-rels';