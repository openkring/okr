import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_ORG_TYPE, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_WORKREL_STATE, DEFAULT_WORKREL_TYPE } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * A work relationship between a person and an organization.
 *
 * Person|Org            worksFor|employs      Org
 *
 * Person: WorkrelType: Employee, Freelancer, Contractor, Internship/Praktikant, Trainee/Lehrling, Volunteer/Freiwilliger, Teacher/Student, BoardMember/Vorstand,
 * Org: Cooperation, Competitor, Supplier, Customer, Partner, Sponsor, Donor
 *
 * Examples:
 * - function in a club (e.g. president, treasurer)
 * - employment in a company
 * - internship in a company
 * - cooperation between two companies
 * - volunteer work in an organization
 * - student job
 * - board membership
 */
export class WorkrelModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME; // name of the work relationship, e.g. project name, job title, description of activity
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  // subject = the person or org that takes a work (employee)
  public subjectKey = DEFAULT_KEY;
  public subjectName1 = DEFAULT_NAME; // name of subject, e.g. lastname
  public subjectName2 = DEFAULT_NAME; // e.g. firstname of subject
  public subjectModelType: 'person' | 'org' = 'person';
  public subjectType = DEFAULT_GENDER;

  // object = the org that gives work (employer)
  public objectKey = DEFAULT_KEY;
  public objectName = DEFAULT_NAME; // name of object
  public objectType = DEFAULT_ORG_TYPE;

  public type = DEFAULT_WORKREL_TYPE; // e.g. employee, freelancer, contractor, internship, volunteer
  public label = DEFAULT_LABEL; // e.g. job title, description of activity
  public validFrom = DEFAULT_DATE; // e.g. start date of the work relationship
  public validTo = DEFAULT_DATE;
  public price = DEFAULT_PRICE; // e.g. monthly salary or hourly rate
  public currency = DEFAULT_CURRENCY;
  public periodicity = 'hourly'; // e.g. monthly, hourly, daily

  public order = DEFAULT_ORDER; // relevant for applications (waiting list) -> state = Applied
  public state = DEFAULT_WORKREL_STATE;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const WorkrelCollection = 'workrels';
