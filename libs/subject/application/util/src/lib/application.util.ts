import { DEFAULT_COUNTRY } from '@okr/shared-constants';
import { ApplicationModel, ApplicationState, BaseType, PersonModel, TypedProperty } from '@okr/shared-models';
import { addIndexElement, getAge } from '@okr/shared-util-core';

export function newApplication(tenantId: string): ApplicationModel {
  const app = new ApplicationModel(tenantId);
  app.countryCode = DEFAULT_COUNTRY;
  app.state = 'applied';
  return app;
}

export function getApplicationIndex(app: ApplicationModel): string {
  let idx = '';
  idx = addIndexElement(idx, 'fn', app.firstName);
  idx = addIndexElement(idx, 'n', app.lastName);
  idx = addIndexElement(idx, 'z', app.zipCode);
  idx = addIndexElement(idx, 'c', app.city);
  idx = addIndexElement(idx, 'k', app.applicationAs);
  idx = addIndexElement(idx, 's', app.state);
  return idx;
}

export function needsSsn(app: ApplicationModel): boolean {
  if (app.applicationAs === 'youth') return true;
  const age = getAge(app.dateOfBirth);
  return age >= 0 && age < 20;
}

/**
 * Whether the application needs a guardian («Erziehungsberechtigte Person»): the applicant is
 * under 18, counted by year of birth (getAge) — the age at which the SCS application form shows
 * its guardian block. Unlike `needsSsn` (youth or under 20) it does not follow `applicationAs`:
 * an 18- or 19-year-old junior applies on their own.
 */
export function needsGuardian(app: ApplicationModel): boolean {
  const age = getAge(app.dateOfBirth);
  return age >= 0 && age < 18;
}

export function toPersonModel(app: ApplicationModel, tenantId: string): PersonModel {
  // ssn/dob ride along as form-model fields only — PersonService strips them from
  // the person write and syncs them into the addresses vault (spec 1.19 Phase 4).
  // favEmail/favPhone are gone from the person; accept() creates the address docs.
  const p = new PersonModel(tenantId) as PersonModel & { ssnId?: string; dateOfBirth?: string };
  p.firstName   = app.firstName;
  p.lastName    = app.lastName;
  p.gender      = app.gender;
  p.dateOfBirth = app.dateOfBirth;
  p.ssnId       = app.ssnId;
  p.favZipCode  = app.zipCode;
  return p;
}

export function newParentPerson(app: ApplicationModel, tenantId: string): PersonModel {
  const p = new PersonModel(tenantId);
  p.firstName  = app.parentFirstName;
  p.lastName   = app.parentLastName;
  p.gender     = 'female';
  p.favZipCode = app.zipCode;
  return p;
}

export function matchesStateFilter(state: ApplicationState, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return state === 'applied' || state === 'reviewing';
  if (filter === 'closed') return state.startsWith('closed.');
  return state === filter;
}

export function stateColor(state: ApplicationState): 'warning' | 'primary' | 'success' | 'danger' | 'medium' {
  switch (state) {
    case 'applied':          return 'warning';
    case 'reviewing':        return 'primary';
    case 'closed.approved':  return 'success';
    case 'closed.denied':    return 'danger';
    case 'closed.cancelled': return 'medium';
  }
}

export function proposeMembershipCategory(app: ApplicationModel): 'junior' | 'active' | 'candidate' {
  const age = getAge(app.dateOfBirth);
  if (age < 20)                         return 'junior';
  if (app.applicationAs === 'transfer') return 'active';
  return 'candidate';
}

/**
 * Whether an application asks for a membership (as opposed to a course registration, spec 1.125 §13.2).
 * Legacy documents carry no `applicationFor` (Firestore reads skip the model initialisers) — they
 * all predate courses and count as membership applications.
 */
export function isMembershipApplication(app: ApplicationModel): boolean {
  return (app.applicationFor ?? 'membership') === 'membership';
}

/** The kind-of-application filter of the back-office list: everything, memberships only, or course registrations only. */
export type ApplicationForFilter = 'all' | 'membership' | 'course';

/** Whether an application passes the kind filter. Legacy documents without `applicationFor` count as membership. */
export function matchesApplicationForFilter(app: ApplicationModel, filter: ApplicationForFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'membership') return isMembershipApplication(app);
  return (app.applicationFor ?? 'membership') === filter;
}

/** Key of the typed property that carries the course of a course registration (value = `CourseModel.okey`). */
export const APPLICATION_COURSE_PROPERTY = 'courseId';

/** The course a course registration is for (the `courseId` property value); '' when there is none. */
export function applicationCourseKey(app: ApplicationModel): string {
  const value = (app.properties ?? []).find(p => p.key === APPLICATION_COURSE_PROPERTY)?.value;
  return typeof value === 'string' ? value : '';
}

/**
 * Returns a copy of `properties` with the value of `key` replaced, coerced to the property's type
 * (spec 1.125 §4.4: key, type and label stay fixed, only the value may be corrected).
 * A number that cannot be read becomes NaN, which the application suite rejects.
 * An unknown key leaves the list unchanged.
 */
export function setPropertyValue(properties: TypedProperty[] | undefined, key: string, value: BaseType | null | undefined): TypedProperty[] {
  return (properties ?? []).map(p => p.key === key ? { ...p, value: coercePropertyValue(p.type, value) } : p);
}

function coercePropertyValue(type: TypedProperty['type'], value: BaseType | null | undefined): BaseType {
  switch (type) {
    case 'boolean': return value === true || value === 'true';
    case 'number':  return (value === null || value === undefined || value === '') ? Number.NaN : Number(value);
    default:        return value === null || value === undefined ? '' : String(value);
  }
}
