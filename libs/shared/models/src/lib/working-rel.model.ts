import { BkModel, NamedModel, SearchableModel, TaggedModel } from "./base.model";
import { GenderType } from "./enums/gender-type.enum";
import { ModelType } from "./enums/model-type.enum";
import { OrgType } from "./enums/org-type.enum";
import { Periodicity } from "./enums/periodicity.enum";
import { WorkingRelState } from "./enums/working-rel-state.enum";
import { WorkingRelType } from "./enums/working-rel-type.enum";

/**
 * A working relationship between a person and an organization.
 * 
 * Person|Org            worksFor|employs      Org
 * 
 * Person: WorkingRelType: Employee, Freelancer, Contractor, Internship/Praktikant, Trainee/Lehrling, Volunteer/Freiwilliger, Teacher/Student, BoardMember/Vorstand, 
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
export class WorkingRelModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
    public bkey = '';
    public tenants: string[] = [];
    public isArchived = false;
    public name = '';       // name of the working relationship, e.g. project name, job title, description of activity
    public index = '';
    public tags = '';
    public notes = ''; 

    // subject = the person or org that takes a work (employee)
    public subjectKey = '';
    public subjectName1 = '';  // name of subject, e.g. lastname
    public subjectName2 = ''; // e.g. firstname of subject
    public subjectModelType? = ModelType.Person | ModelType.Org;
    public subjectType?: GenderType; 

    // object = the org that gives work (employer)
    public objectKey = '';
    public objectName = ''; // name of object
    public objectType?: OrgType;

    public type = WorkingRelType.Employee; // e.g. employee, freelancer, contractor, internship, volunteer
    public label = ''; // e.g. job title, description of activity
    public validFrom = ''; // e.g. start date of the working relationship
    public validTo = ''; 
    public price = 0;    // e.g. monthly salary or hourly rate
    public currency = 'CHF';
    public periodicity = Periodicity.Hourly; // e.g. monthly, hourly, daily
  
    public priority?: number;  // relevant for applications (waiting list) -> state = Applied
    public state?: WorkingRelState; 

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const WorkingRelCollection = 'working-rels';