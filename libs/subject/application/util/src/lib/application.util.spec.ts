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
  setPropertyValue,
} from './application.util';

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
