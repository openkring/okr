import { describe, it, expect, vi } from 'vitest';
import { MembershipModel } from '@okr/shared-models';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';

import { categoryChangeFindings, CategoryChangeTexts, exitYears, oldJuniorFindings, OldJuniorTexts } from './membership-report.util';

// membership.util pulls @okr/shared-util-angular, whose barrel needs I18nService.
vi.mock('@okr/shared-i18n', () => ({
  okrTranslate: vi.fn(),
  I18nService: class {},
}));

const juniorTexts: OldJuniorTexts = { detail: 'Jahrgang {birthYear}, {age} Jahre', nodob: 'Kein Geburtsjahr' };
const changeTexts: CategoryChangeTexts = { detail: '{date}: {oldCategory} -> {newCategory}' };

function membership(over: Partial<MembershipModel>): MembershipModel {
  const m = new MembershipModel('scs');
  m.okey = 'ms-1';
  m.memberKey = 'p/1';
  m.memberName1 = 'Anna';
  m.memberName2 = 'Muster';
  m.orgKey = 'scs';
  m.category = 'junior';
  m.relIsLast = true;
  m.dateOfExit = END_FUTURE_DATE_STR;
  m.memberBirthYear = '2006';
  return Object.assign(m, over);
}

describe('oldJuniorFindings', () => {
  it('reports a too old junior with name, birth year and age', () => {
    const result = oldJuniorFindings([membership({})], 'scs', 2026, juniorTexts);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ms-1');
    expect(result[0].title).toBe('Anna Muster');
    expect(result[0].detail).toBe('Jahrgang 2006, 20 Jahre');
    expect(result[0].url).toBe('/person/p%2F1');
  });

  it('ignores juniors of another org', () => {
    expect(oldJuniorFindings([membership({ orgKey: 'srv' })], 'scs', 2026, juniorTexts)).toEqual([]);
  });

  it('ignores juniors that are not old enough', () => {
    expect(oldJuniorFindings([membership({ memberBirthYear: '2012' })], 'scs', 2026, juniorTexts)).toEqual([]);
  });

  it('reports a missing birth year with the nodob text', () => {
    const result = oldJuniorFindings([membership({ memberBirthYear: '' })], 'scs', 2026, juniorTexts);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toBe('Kein Geburtsjahr');
  });

  it('returns [] for no memberships', () => {
    expect(oldJuniorFindings([], 'scs', 2026, juniorTexts)).toEqual([]);
  });

  it('ignores juniors that already left', () => {
    expect(oldJuniorFindings([membership({ dateOfExit: '20200630' })], 'scs', 2026, juniorTexts)).toEqual([]);
  });

  it('lists a junior leaving on 31 Dec of the reference year', () => {
    expect(oldJuniorFindings([membership({ dateOfExit: '20261231' })], 'scs', 2026, juniorTexts)).toHaveLength(1);
  });

  it('lists a junior with an open exit', () => {
    expect(oldJuniorFindings([membership({ dateOfExit: END_FUTURE_DATE_STR })], 'scs', 2026, juniorTexts)).toHaveLength(1);
  });
});

describe('categoryChangeFindings', () => {
  const first = membership({ okey: 'a', order: 1, relIsLast: false, dateOfExit: '20250331', category: 'junior' });
  const second = membership({ okey: 'b', order: 2, relIsLast: true, category: 'active' });

  it('reports a category change in the given year', () => {
    const result = categoryChangeFindings([first, second], 'scs', '2025', changeTexts);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Anna Muster');
    expect(result[0].detail).toBe('20250331: junior -> active');
    expect(result[0].url).toBe('/person/p%2F1');
  });

  it('reports nothing for another year', () => {
    expect(categoryChangeFindings([first, second], 'scs', '2024', changeTexts)).toEqual([]);
  });

  it('returns [] for no memberships', () => {
    expect(categoryChangeFindings([], 'scs', '2025', changeTexts)).toEqual([]);
  });
});

describe('exitYears', () => {
  it('lists the distinct exit years of the org, newest first', () => {
    const list = [
      membership({ dateOfExit: '20240101' }),
      membership({ dateOfExit: '20250331' }),
      membership({ dateOfExit: '20250601' }),
      membership({ dateOfExit: '20190101', orgKey: 'srv' }),
      membership({ dateOfExit: END_FUTURE_DATE_STR }),
    ];
    expect(exitYears(list, 'scs')).toEqual(['2025', '2024']);
  });

  it('returns [] for no memberships', () => {
    expect(exitYears([], 'scs')).toEqual([]);
  });
});
