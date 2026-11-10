import { DEFAULT_COUNTRY } from '@okr/shared-constants';
import { ApplicationCourseState, ApplicationModel, ApplicationState, BaseType, PersonModel, TypedProperty } from '@okr/shared-models';
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

/**
 * The course an application is on: `courseKey` (spec 1.152), else the 1.125 B `courseId` property
 * value of a course registration (spec 1.152 §13); '' when there is none.
 */
export function applicationCourseKey(app: ApplicationModel): string {
  const key = app.courseKey ?? '';
  if (key) return key;
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


// ---------------------------------------------------------------------------
// List helpers (spec 1.152 §9): sort, duplicate hints, merge
// ---------------------------------------------------------------------------

/** Rank of a course state when two applications are merged; the higher one survives. */
export const COURSE_STATE_RANK: Record<ApplicationCourseState, number> = {
  accepted: 4, invited: 3, registered: 2, declined: 1, '': 0,
};

function courseRank(state: ApplicationCourseState | undefined | null): number {
  return COURSE_STATE_RANK[state ?? ''] ?? 0;
}

const COLLATOR_OPTIONS: Intl.CollatorOptions = { sensitivity: 'base' };

/** lastName, firstName (locale de, case/accent-insensitive), then submittedAt desc. */
export function compareApplicationsByName(a: ApplicationModel, b: ApplicationModel): number {
  const byLast = (a.lastName ?? '').localeCompare(b.lastName ?? '', 'de', COLLATOR_OPTIONS);
  if (byLast !== 0) return byLast;
  const byFirst = (a.firstName ?? '').localeCompare(b.firstName ?? '', 'de', COLLATOR_OPTIONS);
  if (byFirst !== 0) return byFirst;
  return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '');
}

function normName(s: string | undefined | null): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFC');
}

function normEmail(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase();
}

function duplicateKeys(app: ApplicationModel): string[] {
  const keys: string[] = [];
  const last = normName(app.lastName);
  const first = normName(app.firstName);
  if (last && first) keys.push(`n:${last}|${first}`);
  const email = normEmail(app.email);
  if (email) keys.push(`e:${email}`);
  const dob = (app.dateOfBirth ?? '').trim();
  if (dob && last) keys.push(`d:${dob}|${last}`);
  return keys;
}

/**
 * Likely duplicates (A5): same normalised last + first name, or same e-mail, or same date of birth
 * + last name. Only applications with at least one duplicate get an entry; the value lists the
 * OTHER okeys. Archived applications are ignored.
 */
export function findDuplicateGroups(apps: ApplicationModel[]): Map<string, string[]> {
  const live = apps.filter(a => !a.isArchived);
  const byKey = new Map<string, string[]>();
  for (const app of live) {
    for (const k of duplicateKeys(app)) {
      const list = byKey.get(k);
      if (list) list.push(app.okey); else byKey.set(k, [app.okey]);
    }
  }
  const result = new Map<string, string[]>();
  for (const app of live) {
    const others = new Set<string>();
    for (const k of duplicateKeys(app)) {
      for (const o of byKey.get(k) ?? []) if (o !== app.okey) others.add(o);
    }
    if (others.size > 0) result.set(app.okey, [...others]);
  }
  return result;
}

const MERGE_FILL_FIELDS = [
  'firstName', 'lastName', 'dateOfBirth', 'ssnId', 'email', 'phone',
  'streetName', 'streetNumber', 'zipCode', 'city',
  'parentFirstName', 'parentLastName', 'parentEmail', 'parentPhone',
  'personKey', 'taskKey',
] as const;

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** The course states that came from an invitation; the emailed answer link is signed for that okey. */
const INVITATION_COURSE_STATES: ApplicationCourseState[] = ['invited', 'accepted', 'declined'];

/** Whether the application holds a course invitation (and thus an answer link signed for its okey). */
export function hasCourseInvitation(app: Pick<ApplicationModel, 'courseState'>): boolean {
  return INVITATION_COURSE_STATES.includes(app.courseState ?? '');
}

/**
 * Which application survives a merge (spec 1.152 §9, final review). The invitee's answer link is
 * signed for one okey; archiving that application would orphan the link. So when only `drop` holds
 * an invitation, the roles swap: `drop` is kept and `keep` is merged into it. Otherwise unchanged.
 */
export function pickMergeKeep(keep: ApplicationModel, drop: ApplicationModel): { keep: ApplicationModel; drop: ApplicationModel; swapped: boolean } {
  if (hasCourseInvitation(drop) && !hasCourseInvitation(keep)) return { keep: drop, drop: keep, swapped: true };
  return { keep, drop, swapped: false };
}

/**
 * Fills every empty field of `keep` from `drop`, unions `properties` by key (keep wins), keeps the
 * further `courseState` (with its course, invitedAt, answeredAt), the earlier `submittedAt`, and
 * appends `drop.notes`. Pure: returns a new object. `okey`, `tenants`, `state` always stay keep's.
 */
export function mergeApplications(keep: ApplicationModel, drop: ApplicationModel): { merged: ApplicationModel; takenFromDrop: string[] } {
  const merged: ApplicationModel = { ...keep, properties: [...(keep.properties ?? [])] };
  const taken: string[] = [];
  const rec = merged as unknown as Record<string, unknown>;
  const src = drop as unknown as Record<string, unknown>;

  for (const f of MERGE_FILL_FIELDS) {
    if (isEmptyValue(rec[f]) && !isEmptyValue(src[f])) { rec[f] = src[f]; taken.push(f); }
  }
  if (isEmptyValue(merged.reviewer) && !isEmptyValue(drop.reviewer)) { merged.reviewer = drop.reviewer; taken.push('reviewer'); }
  if (isEmptyValue(merged.tags) && !isEmptyValue(drop.tags)) { merged.tags = drop.tags; taken.push('tags'); }

  // properties: union by key, keep wins unless keep's value is empty (false is NOT empty)
  const isEmptyProp = (v: unknown): boolean => v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));
  const dropByKey = new Map((drop.properties ?? []).map(p => [p.key, p]));
  let propsTaken = false;
  merged.properties = merged.properties.map(p => {
    const d = dropByKey.get(p.key);
    if (d && isEmptyProp(p.value) && !isEmptyProp(d.value)) { propsTaken = true; return { ...p, value: d.value }; }
    return p;
  });
  const have = new Set(merged.properties.map(p => p.key));
  const extra = (drop.properties ?? []).filter(p => !have.has(p.key));
  if (extra.length > 0) { merged.properties = [...merged.properties, ...extra]; propsTaken = true; }
  if (propsTaken) taken.push('properties');

  // course: the further state wins and brings its course key and timestamps
  if (courseRank(drop.courseState) > courseRank(keep.courseState)) {
    merged.courseState = drop.courseState;
    merged.courseKey = drop.courseKey ?? '';
    merged.invitedAt = drop.invitedAt ?? '';
    merged.answeredAt = drop.answeredAt ?? '';
    taken.push('courseState', 'courseKey');
  } else if (isEmptyValue(merged.courseKey) && !isEmptyValue(drop.courseKey)) {
    merged.courseKey = drop.courseKey;
    taken.push('courseKey');
  }

  // earlier submittedAt
  if (drop.submittedAt && (!keep.submittedAt || drop.submittedAt < keep.submittedAt)) {
    merged.submittedAt = drop.submittedAt;
    taken.push('submittedAt');
  }

  // notes appended
  if (!isEmptyValue(drop.notes)) {
    merged.notes = isEmptyValue(keep.notes) ? drop.notes : `${keep.notes}\n${drop.notes}`;
    taken.push('notes');
  }

  return { merged, takenFromDrop: taken };
}

/**
 * Persons that may already be the applicant (spec 1.152 §9 «Als Person erfassen»): same normalised
 * first + last name. Archived persons are ignored. The date of birth lives in the address vault, so
 * the caller compares it separately (`isSameBirthDate`).
 */
export function findPersonCandidates<P extends Pick<PersonModel, 'okey' | 'firstName' | 'lastName'> & { isArchived?: boolean }>(
  app: ApplicationModel, persons: P[]
): P[] {
  const last = normName(app.lastName);
  const first = normName(app.firstName);
  if (!last || !first) return [];
  return persons.filter(p => !p.isArchived && normName(p.lastName) === last && normName(p.firstName) === first);
}

/** Two birth dates contradict only when both are known and differ; an unknown one never excludes a match. */
export function isSameBirthDate(a: string | undefined | null, b: string | undefined | null): boolean {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  return !x || !y || x === y;
}
