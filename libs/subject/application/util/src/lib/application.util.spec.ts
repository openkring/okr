import { describe, it, expect, vi } from 'vitest';
import { ApplicationModel } from '@bk2/shared-models';

vi.mock('@bk2/shared-util-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bk2/shared-util-core')>();
  return { ...actual };
});

import {
  newApplication,
  getApplicationIndex,
  needsSsn,
  toPersonModel,
  matchesStateFilter,
  stateColor,
  proposeMembershipCategory,
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
    expect(person.dateOfBirth).toBe('20050605');
    expect(person.ssnId).toBe('756.1234.5678.90');
    expect(person.favEmail).toBe('lukas@example.com');
    expect(person.favPhone).toBe('+41791234567');
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
