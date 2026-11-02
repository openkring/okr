import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, PersistedModel } from './base.model';

/**
 * Marks that a case was reported to an external organisation (e.g. a membership change reported
 * to SRV SwissRowing). Generic: `externalOrg` names the receiving organisation. Holds no names or
 * other PII — `subjectKey` points to the person.
 * Document id: `${tenantId}-${externalOrg}-${caseKey}`.
 */
export class ExternalReportModel implements OkrModel, PersistedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;

  public externalOrg = '';       // short id of the receiving organisation, e.g. 'srv'
  public externalOrgName = '';   // display name, e.g. 'SRV SwissRowing'
  public caseKey = '';           // what was reported, unique per organisation
  public caseType = '';          // kind of case
  public subjectKey = '';        // 'person.<okey>' or '' when the case has no person
  public externalRef = '';       // the organisation's own reference, e.g. the Regasoft rid
  public reportedAt = '';        // StoreDate YYYYMMDD

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ExternalReportCollection = 'external-reports';
export const ExternalReportModelName = 'external-report';
