import { describe, it, expect, vi } from 'vitest';
import { ApplicationModel, TypedProperty } from '@okr/shared-models';

vi.mock('@okr/shared-util-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@okr/shared-util-core')>();
  return { ...actual };
});

import {
  newApplication,
  getApplicationIndex,
  needsGuardian,
  needsSsn,
  toPersonModel,
  matchesStateFilter,
  stateColor,
  proposeMembershipCategory,
  isMembershipApplication,
  matchesApplicationForFilter,
  applicationCourseKey,
  compareApplicationsByName,
  findDuplicateGroups,
  mergeApplications,
  COURSE_STATE_RANK,
  setPropertyValue,
  findPersonCandidates,
  isSameBirthDate,
} from './application.util';
import { MERGE_FIELD_I18N } from './application-i18n';

describe('newApplication', () => {
  it('returns ApplicationModel with state=applied and countryCode=CH', () => {
    const app = newApplication('tenant1');
    expect(app.state).toBe('applied');
    expect(app.countryCode).toBe('CH');
    expect(app.tenants).toContain('tenant1');
  });
});

describe('getApplicationIndex', () => {
  it('includes firstName, lastName, zipCode, city, applicationAs, state', () => {
    const app = newApplication('t');
    app.firstName = 'Anna';
    app.lastName = 'Müller';
    app.zipCode = '8000';
    app.city = 'Zürich';
    app.applicationAs = 'youth';
    app.state = 'applied';
    const idx = getApplicationIndex(app);
    expect(idx).toContain('Anna');
    expect(idx).toContain('Müller');
    expect(idx).toContain('8000');
    expect(idx).toContain('Zürich');
    expect(idx).toContain('youth');
    expect(idx).toContain('applied');
  });
});

describe('needsGuardian', () => {
  const year = new Date().getFullYear();
  const born = (age: number) => `${year - age}0101`;

  it('is true under 18, counted by year of birth, whatever the kind of application', () => {
    const app = newApplication('t');
    app.applicationAs = 'adult';
    app.dateOfBirth = born(17);
    expect(needsGuardian(app)).toBe(true);
    app.dateOfBirth = `${year - 17}1231`; // the year counts, not the birthday
    expect(needsGuardian(app)).toBe(true);
  });

  it('is false from 18 on, also for a youth application', () => {
    const app = newApplication('t');
    app.applicationAs = 'youth';
    app.dateOfBirth = born(18);
    expect(needsGuardian(app)).toBe(false);
    app.dateOfBirth = born(19);
    expect(needsGuardian(app)).toBe(false);
  });

  it('is false without a valid date of birth', () => {
    const app = newApplication('t');
    app.applicationAs = 'youth';
    app.dateOfBirth = '';
    expect(needsGuardian(app)).toBe(false);
  });
});

describe('needsSsn', () => {
  it('returns true when applicationAs is youth', () => {
    const app = newApplication('t');
    app.applicationAs = 'youth';
    app.dateOfBirth = '20100101';
    expect(needsSsn(app)).toBe(true);
  });

  it('returns true when applicant is under 20 (adult form)', () => {
    const app = newApplication('t');
    app.applicationAs = 'adult';
    const year = new Date().getFullYear();
    app.dateOfBirth = `${year - 10}0101`;
    expect(needsSsn(app)).toBe(true);
  });

  it('returns false when applicant is 20+ and not youth', () => {
    const app = newApplication('t');
    app.applicationAs = 'adult';
    app.dateOfBirth = '19900101';
    expect(needsSsn(app)).toBe(false);
  });
});

describe('toPersonModel', () => {
  it('maps application fields to PersonModel', () => {
    const app = newApplication('t');
    app.firstName = 'Lukas';
    app.lastName = 'Meier';
    app.gender = 'male';
    app.dateOfBirth = '20050605';
    app.ssnId = '756.1234.5678.90';
    app.email = 'lukas@example.com';
    app.phone = '+41791234567';
    app.zipCode = '8001';
    const person = toPersonModel(app, 't');
    expect(person.firstName).toBe('Lukas');
    expect(person.lastName).toBe('Meier');
    expect(person.gender).toBe('male');
    // ssn/dob ride along as form-model fields for the vault sync (spec 1.19 Phase 4);
    // favEmail/favPhone were stripped — accept() creates the address docs instead.
    expect(person.dateOfBirth).toBe('20050605');
    expect(person.ssnId).toBe('756.1234.5678.90');
    expect(person.favZipCode).toBe('8001');
    expect(person.tenants).toContain('t');
  });
});

describe('matchesStateFilter', () => {
  it("'all' matches any state", () => {
    expect(matchesStateFilter('applied', 'all')).toBe(true);
    expect(matchesStateFilter('closed.approved', 'all')).toBe(true);
  });

  it("'open' matches applied and reviewing", () => {
    expect(matchesStateFilter('applied', 'open')).toBe(true);
    expect(matchesStateFilter('reviewing', 'open')).toBe(true);
    expect(matchesStateFilter('closed.approved', 'open')).toBe(false);
  });

  it("'closed' matches states starting with 'closed.'", () => {
    expect(matchesStateFilter('closed.approved', 'closed')).toBe(true);
    expect(matchesStateFilter('closed.denied', 'closed')).toBe(true);
    expect(matchesStateFilter('reviewing', 'closed')).toBe(false);
  });

  it('exact match works', () => {
    expect(matchesStateFilter('applied', 'applied')).toBe(true);
    expect(matchesStateFilter('reviewing', 'applied')).toBe(false);
  });
});

describe('stateColor', () => {
  it('maps states to ion colors', () => {
    expect(stateColor('applied')).toBe('warning');
    expect(stateColor('reviewing')).toBe('primary');
    expect(stateColor('closed.approved')).toBe('success');
    expect(stateColor('closed.denied')).toBe('danger');
    expect(stateColor('closed.cancelled')).toBe('medium');
  });
});

describe('proposeMembershipCategory', () => {
  it('returns junior for under-20 applicant', () => {
    const app = newApplication('t');
    const year = new Date().getFullYear();
    app.dateOfBirth = `${year - 15}0101`;
    expect(proposeMembershipCategory(app)).toBe('junior');
  });

  it('returns active for transfer applicant 20+', () => {
    const app = newApplication('t');
    app.applicationAs = 'transfer';
    app.dateOfBirth = '19900101';
    expect(proposeMembershipCategory(app)).toBe('active');
  });

  it('returns candidate for adult 20+ non-transfer', () => {
    const app = newApplication('t');
    app.applicationAs = 'adult';
    app.dateOfBirth = '19900101';
    expect(proposeMembershipCategory(app)).toBe('candidate');
  });
});

describe('isMembershipApplication', () => {
  it("returns true for applicationFor 'membership'", () => {
    const app = newApplication('t');
    app.applicationFor = 'membership';
    expect(isMembershipApplication(app)).toBe(true);
  });

  it("returns false for applicationFor 'course'", () => {
    const app = newApplication('t');
    app.applicationFor = 'course';
    expect(isMembershipApplication(app)).toBe(false);
  });

  it('applicationFor undefined counts as membership', () => {
    // a legacy Firestore document has no applicationFor — reads skip the model initialisers
    const legacy = { ...newApplication('t'), applicationFor: undefined } as unknown as ApplicationModel;
    expect(isMembershipApplication(legacy)).toBe(true);
  });
});

describe('setPropertyValue', () => {
  const props: TypedProperty[] = [
    { key: 'rowingExperience', type: 'boolean', value: false, label: 'Ich bin schon gerudert' },
    { key: 'age',              type: 'number',  value: 3,     label: 'Jahre' },
    { key: 'previousClub',     type: 'text',    value: 'SCZ', label: 'Bisheriger Club' },
  ];

  it('replaces only the value of the given key and keeps key, type and label', () => {
    const result = setPropertyValue(props, 'previousClub', 'RCZ');
    expect(result[2]).toEqual({ key: 'previousClub', type: 'text', value: 'RCZ', label: 'Bisheriger Club' });
    expect(result[0]).toBe(props[0]);
    expect(props[2].value).toBe('SCZ');   // the input list is not mutated
  });

  it('stores numbers as numbers', () => {
    expect(setPropertyValue(props, 'age', '7')[1].value).toBe(7);
    expect(setPropertyValue(props, 'age', 4)[1].value).toBe(4);
  });

  it('turns an empty number into NaN so validation can reject it', () => {
    expect(setPropertyValue(props, 'age', null)[1].value).toBeNaN();
    expect(setPropertyValue(props, 'age', '')[1].value).toBeNaN();
  });

  it('stores booleans as booleans', () => {
    expect(setPropertyValue(props, 'rowingExperience', true)[0].value).toBe(true);
    expect(setPropertyValue(props, 'rowingExperience', 'true')[0].value).toBe(true);
    expect(setPropertyValue(props, 'rowingExperience', false)[0].value).toBe(false);
  });

  it('leaves the list unchanged for an unknown key and tolerates a legacy undefined list', () => {
    expect(setPropertyValue(props, 'unknown', 'x')).toEqual(props);
    expect(setPropertyValue(undefined, 'age', 1)).toEqual([]);
  });
});

describe('matchesApplicationForFilter', () => {
  const membership = newApplication('t');
  const course = newApplication('t');
  course.applicationFor = 'course';
  const legacy = { ...newApplication('t'), applicationFor: undefined } as unknown as ApplicationModel;

  it("'all' matches everything", () => {
    expect(matchesApplicationForFilter(membership, 'all')).toBe(true);
    expect(matchesApplicationForFilter(course, 'all')).toBe(true);
    expect(matchesApplicationForFilter(legacy, 'all')).toBe(true);
  });

  it("'membership' matches membership and legacy applications only", () => {
    expect(matchesApplicationForFilter(membership, 'membership')).toBe(true);
    expect(matchesApplicationForFilter(legacy, 'membership')).toBe(true);
    expect(matchesApplicationForFilter(course, 'membership')).toBe(false);
  });

  it("'course' matches course applications only", () => {
    expect(matchesApplicationForFilter(course, 'course')).toBe(true);
    expect(matchesApplicationForFilter(membership, 'course')).toBe(false);
    expect(matchesApplicationForFilter(legacy, 'course')).toBe(false);
  });
});

describe('applicationCourseKey', () => {
  const prop = (key: string, value: string): TypedProperty => ({ key, type: 'text', value, label: key });

  it('reads the courseId property', () => {
    const app = newApplication('t');
    app.properties = [prop('level', 'A'), prop('courseId', 'abc123')];
    expect(applicationCourseKey(app)).toBe('abc123');
  });

  it('is empty without the property, with an empty list, or on a legacy document', () => {
    const app = newApplication('t');
    app.properties = [prop('level', 'A')];
    expect(applicationCourseKey(app)).toBe('');
    app.properties = [];
    expect(applicationCourseKey(app)).toBe('');
    const legacy = { ...newApplication('t'), properties: undefined } as unknown as ApplicationModel;
    expect(applicationCourseKey(legacy)).toBe('');
  });

  it('is empty when the value is not a string', () => {
    const app = newApplication('t');
    app.properties = [{ key: 'courseId', type: 'number', value: 5, label: 'x' }];
    expect(applicationCourseKey(app)).toBe('');
  });

  it('prefers courseKey over the 1.125 courseId property', () => {
    const app = newApplication('t');
    app.courseKey = 'new1';
    app.properties = [prop('courseId', 'old1')];
    expect(applicationCourseKey(app)).toBe('new1');
  });

  it('falls back to the property when courseKey is missing on a raw document', () => {
    const raw = { properties: [prop('courseId', 'old1')] } as unknown as ApplicationModel;
    expect(applicationCourseKey(raw)).toBe('old1');
    expect(applicationCourseKey({} as ApplicationModel)).toBe('');
  });
});

describe('findPersonCandidates', () => {
  const person = (okey: string, firstName: string, lastName: string, isArchived = false) => ({ okey, firstName, lastName, isArchived });
  const persons = [
    person('p1', 'Anna', 'Müller'),
    person('p2', ' anna ', 'MÜLLER'),
    person('p3', 'Anna', 'Meier'),
    person('p4', 'Anna', 'Müller', true),
  ];

  it('matches normalised first + last name and skips archived persons', () => {
    const app = mk({ firstName: 'Anna', lastName: 'Müller' });
    expect(findPersonCandidates(app, persons).map(p => p.okey)).toEqual(['p1', 'p2']);
  });

  it('returns nothing when the application has no full name', () => {
    expect(findPersonCandidates(mk({ firstName: '', lastName: 'Müller' }), persons)).toEqual([]);
    expect(findPersonCandidates({} as ApplicationModel, persons)).toEqual([]);
  });
});

describe('isSameBirthDate', () => {
  it('excludes only when both dates are known and differ', () => {
    expect(isSameBirthDate('20100101', '20100101')).toBe(true);
    expect(isSameBirthDate('20100101', '20100102')).toBe(false);
    expect(isSameBirthDate('', '20100102')).toBe(true);
    expect(isSameBirthDate('20100101', undefined)).toBe(true);
  });
});

function mk(o: Partial<ApplicationModel>): ApplicationModel {
  return Object.assign(new ApplicationModel('scs'), o);
}

describe('compareApplicationsByName', () => {
  it('sorts by last name (de, base), first name, then newer submittedAt first', () => {
    const list = [mk({ lastName: 'Zahn', firstName: 'Al' }), mk({ lastName: 'muller', firstName: 'Ben' }), mk({ lastName: 'Müller', firstName: 'Anna' })];
    expect(list.sort(compareApplicationsByName).map(a => a.firstName)).toEqual(['Anna', 'Ben', 'Al']);
    const eq = [mk({ lastName: 'A', firstName: 'B', submittedAt: '2026-01-01' }), mk({ lastName: 'A', firstName: 'B', submittedAt: '2026-02-01' })];
    expect(eq.sort(compareApplicationsByName)[0].submittedAt).toBe('2026-02-01');
  });
});

describe('findDuplicateGroups', () => {
  it('groups normalised names, lists only the others', () => {
    const g = findDuplicateGroups([mk({ okey: 'a', firstName: 'Anna', lastName: 'Müller' }), mk({ okey: 'b', firstName: ' anna ', lastName: ' müller  ' }), mk({ okey: 'c', firstName: 'Zoe', lastName: 'X' })]);
    expect(g.get('a')).toEqual(['b']);
    expect(g.get('b')).toEqual(['a']);
    expect(g.has('c')).toBe(false);
  });
  it('does not equate Müller and Muller', () => {
    expect(findDuplicateGroups([mk({ okey: 'a', firstName: 'A', lastName: 'Müller' }), mk({ okey: 'b', firstName: 'A', lastName: 'Muller' })]).size).toBe(0);
  });
  it('groups by e-mail, never on empty e-mail', () => {
    const g = findDuplicateGroups([mk({ okey: 'a', firstName: 'A', lastName: 'B', email: ' X@y.ch ' }), mk({ okey: 'b', firstName: 'C', lastName: 'D', email: 'x@Y.ch' }), mk({ okey: 'c', firstName: 'E', lastName: 'F' }), mk({ okey: 'd', firstName: 'G', lastName: 'H' })]);
    expect(g.get('a')).toEqual(['b']);
    expect(g.has('c')).toBe(false);
    expect(g.has('d')).toBe(false);
  });
  it('groups by dob + last name', () => {
    const g = findDuplicateGroups([mk({ okey: 'a', firstName: 'A', lastName: 'B', dateOfBirth: '20000101' }), mk({ okey: 'b', firstName: 'C', lastName: 'B', dateOfBirth: '20000101' }), mk({ okey: 'c', firstName: 'Z', lastName: 'B' })]);
    expect(g.get('a')).toEqual(['b']);
    expect(g.has('c')).toBe(false);
  });
  it('ignores archived applications', () => {
    expect(findDuplicateGroups([mk({ okey: 'a', firstName: 'A', lastName: 'B' }), mk({ okey: 'b', firstName: 'A', lastName: 'B', isArchived: true })]).size).toBe(0);
  });
});

describe('mergeApplications', () => {
  it('fills empty fields from drop and reports them', () => {
    const keep = mk({ okey: 'k', firstName: 'A', lastName: 'B', phone: '' });
    const drop = mk({ okey: 'd', firstName: 'Other', phone: '079', city: 'Zürich' });
    const { merged, takenFromDrop } = mergeApplications(keep, drop);
    expect(merged.phone).toBe('079');
    expect(merged.firstName).toBe('A');
    expect(takenFromDrop).toEqual(expect.arrayContaining(['phone', 'city']));
    expect(takenFromDrop).not.toContain('firstName');
    expect(keep.phone).toBe('');
  });
  it('unions properties by key, keep wins', () => {
    const p = (key: string, value: string): TypedProperty => ({ key, type: 'string', value } as unknown as TypedProperty);
    const { merged } = mergeApplications(mk({ properties: [p('a', '1')] }), mk({ properties: [p('a', '2'), p('b', '3')] }));
    expect(merged.properties.map(x => [x.key, x.value])).toEqual([['a', '1'], ['b', '3']]);
  });
  it('takes drop\'s property value when keep\'s is empty, but keeps false', () => {
    const p = (key: string, value: unknown): TypedProperty => ({ key, type: 'text', value } as unknown as TypedProperty);
    const r = mergeApplications(mk({ properties: [p('a', ''), p('b', false)] }), mk({ properties: [p('a', '2'), p('b', true)] }));
    expect(r.merged.properties.map(x => [x.key, x.value])).toEqual([['a', '2'], ['b', false]]);
    expect(r.takenFromDrop).toContain('properties');
  });
  it('takes the higher course state with its course', () => {
    const { merged, takenFromDrop } = mergeApplications(
      mk({ courseState: 'registered', courseKey: 'c1' }),
      mk({ courseState: 'invited', courseKey: 'c2', invitedAt: 'T' }));
    expect(merged.courseState).toBe('invited');
    expect(merged.courseKey).toBe('c2');
    expect(merged.invitedAt).toBe('T');
    expect(takenFromDrop).toContain('courseState');
    expect(COURSE_STATE_RANK.accepted).toBeGreaterThan(COURSE_STATE_RANK.invited);
  });
  it('keeps the earlier submittedAt and appends notes', () => {
    const { merged } = mergeApplications(mk({ submittedAt: '2026-03-01', notes: 'a' }), mk({ submittedAt: '2026-01-01', notes: 'b' }));
    expect(merged.submittedAt).toBe('2026-01-01');
    expect(merged.notes).toBe('a\nb');
  });
  it('never overwrites okey, tenants, state; fills empty personKey', () => {
    const keep = mk({ okey: 'k', state: 'reviewing', personKey: '' });
    const drop = mk({ okey: 'd', tenants: ['x'], state: 'applied', personKey: 'person.1' });
    const { merged } = mergeApplications(keep, drop);
    expect(merged.okey).toBe('k');
    expect(merged.tenants).toEqual(['scs']);
    expect(merged.state).toBe('reviewing');
    expect(merged.personKey).toBe('person.1');
    expect(mergeApplications(mk({ personKey: 'p.k' }), drop).merged.personKey).toBe('p.k');
  });
});

describe('MERGE_FIELD_I18N', () => {
  it('has a label for every field a merge can take over', () => {
    const keep = mk({ okey: 'k', firstName: '', lastName: '', email: '', submittedAt: '2026-02-01T00:00:00' });
    const drop = mk({
      okey: 'd', firstName: 'A', lastName: 'B', dateOfBirth: '20100101', ssnId: '756', email: 'a@b.ch', phone: '1',
      streetName: 'S', streetNumber: '1', zipCode: '8000', city: 'Z',
      parentFirstName: 'P', parentLastName: 'Q', parentEmail: 'p@q.ch', parentPhone: '2',
      personKey: 'p1', taskKey: 't1', tags: 'x', notes: 'n', submittedAt: '2026-01-01T00:00:00',
      reviewer: { key: 'r', name1: 'R', name2: '', modelType: 'person', type: '', subType: '', label: '' },
      properties: [{ key: 'level', type: 'text', value: 'A', label: 'Level' }],
      courseKey: 'c1', courseState: 'invited',
    });
    const { takenFromDrop } = mergeApplications(keep, drop);
    expect(takenFromDrop.filter(f => !MERGE_FIELD_I18N[f])).toEqual([]);
    expect(takenFromDrop).toContain('courseState');
  });
});
