import { describe, expect, it } from 'vitest';

import { NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { AvatarInfo, CourseEligible, CourseFinanceModel, CourseModel, MoneyModel } from '@okr/shared-models';

import { COURSE_NUMBER_LENGTH, courseFinanceValidations, courseValidations } from './course.validations';

const PFX = '@calendar/course/feature.validation.';

function person(key: string): AvatarInfo {
  return { key, name1: 'Anna', name2: key, modelType: 'person', type: '', subType: '', label: '' };
}

function course(over: Partial<CourseModel> = {}): CourseModel {
  return Object.assign(new CourseModel('scs'), {
    name: 'Herbstkurs U14', groupKey: 'g1', startDate: '20260901', endDate: '20261215',
    responsiblePersons: [person('pR')], ...over,
  });
}

describe('courseValidations', () => {
  it('accepts a complete course', () => {
    expect(courseValidations(course()).isValid()).toBe(true);
  });

  it('name: required and capped', () => {
    expect(courseValidations(course({ name: '' })).getErrors('name')).toContain('required');
    expect(courseValidations(course({ name: 'x'.repeat(NAME_LENGTH + 1) })).getErrors('name')).toContain('tooLong');
    expect(courseValidations(course({ name: 'x'.repeat(NAME_LENGTH) })).getErrors('name')).toEqual([]);
  });

  it('groupKey: required (the group is preset, never typed)', () => {
    expect(courseValidations(course({ groupKey: '' })).getErrors('groupKey')).toContain('required');
  });

  it('dates: both required and real dates', () => {
    expect(courseValidations(course({ startDate: '' })).getErrors('startDate')).toContain('required');
    expect(courseValidations(course({ endDate: '' })).getErrors('endDate')).toContain('required');
    expect(courseValidations(course({ endDate: '20261340' })).getErrors('endDate')).toContain('invalidDate');
  });

  it('endDate must not be before startDate; the same day is a one-day course', () => {
    expect(courseValidations(course({ startDate: '20261215', endDate: '20260901' })).getErrors('endDate')).toContain(PFX + 'endBeforeStart');
    expect(courseValidations(course({ startDate: '20260901', endDate: '20260901' })).getErrors('endDate')).toEqual([]);
  });

  it('endDate before startDate is not reported while one of the dates is still empty', () => {
    expect(courseValidations(course({ startDate: '' })).getErrors('endDate')).toEqual([]);
  });

  it('needs at least one responsible person', () => {
    expect(courseValidations(course({ responsiblePersons: [] })).getErrors('responsiblePersons')).toContain(PFX + 'responsibleRequired');
    // a legacy document without the field
    expect(courseValidations(course({ responsiblePersons: undefined as never })).getErrors('responsiblePersons')).toContain(PFX + 'responsibleRequired');
  });

  describe('reportProfile js', () => {
    const js = (settings: CourseModel['reportSettings']) => course({ reportProfile: 'js', reportSettings: settings });

    it('requires userGroup and mainSportCategory', () => {
      const result = courseValidations(js({}));
      expect(result.getErrors('reportSettings.userGroup')).toContain('required');
      expect(result.getErrors('reportSettings.mainSportCategory')).toContain('required');
    });

    it('a legacy document without reportSettings is incomplete, not a crash', () => {
      const result = courseValidations(js(undefined as never));
      expect(result.getErrors('reportSettings.userGroup')).toContain('required');
    });

    it('accepts a defined pair', () => {
      expect(courseValidations(js({ userGroup: '2', mainSportCategory: 'abs2' })).isValid()).toBe(true);
      expect(courseValidations(js({ userGroup: '4', mainSportCategory: 'abs1' })).isValid()).toBe(true);
    });

    it('rejects a pair the J+S rules do not define (NG 1 with Abs. 2, NG 2 with Abs. 1)', () => {
      expect(courseValidations(js({ userGroup: '1', mainSportCategory: 'abs2' })).getErrors('reportSettings.mainSportCategory')).toContain(PFX + 'jsPairInvalid');
      expect(courseValidations(js({ userGroup: '2', mainSportCategory: 'abs1' })).getErrors('reportSettings.mainSportCategory')).toContain(PFX + 'jsPairInvalid');
    });

    it('rejects an unknown user group without calling it a missing one', () => {
      const result = courseValidations(js({ userGroup: '3' as never, mainSportCategory: 'abs1' }));
      expect(result.getErrors('reportSettings.mainSportCategory')).toContain(PFX + 'jsPairInvalid');
      expect(result.getErrors('reportSettings.userGroup')).toEqual([]);
    });

    it('courseNumber is optional but capped', () => {
      expect(courseValidations(js({ userGroup: '1', mainSportCategory: 'abs1', courseNumber: '' })).isValid()).toBe(true);
      expect(courseValidations(js({ userGroup: '1', mainSportCategory: 'abs1', courseNumber: 'x'.repeat(COURSE_NUMBER_LENGTH + 1) }))
        .getErrors('reportSettings.courseNumber')).toContain('tooLong');
    });

    it('COURSE_NUMBER_LENGTH is the word length', () => {
      expect(COURSE_NUMBER_LENGTH).toBe(WORD_LENGTH);
    });
  });

  it('other profiles do not ask for J+S settings', () => {
    expect(courseValidations(course({ reportProfile: 'generic', reportSettings: {} })).isValid()).toBe(true);
    expect(courseValidations(course({ reportProfile: 'none', reportSettings: {} })).isValid()).toBe(true);
  });
});

function finance(over: Partial<CourseFinanceModel> = {}): CourseFinanceModel {
  return Object.assign(new CourseFinanceModel(), over);
}
const eligible = (key: string, rate?: MoneyModel): CourseEligible => ({ person: person(key), ...(rate ? { rate } : {}) });

describe('courseFinanceValidations', () => {
  it('an empty, new finance document is valid (nothing is set up yet)', () => {
    expect(courseFinanceValidations(finance()).isValid()).toBe(true);
  });

  it('accepts a complete setup', () => {
    const f = finance({ accountingTenantId: 'scs', defaultRate: new MoneyModel(2500), eligible: [eligible('pA'), eligible('pB', new MoneyModel(3000))] });
    expect(courseFinanceValidations(f, ['scs', 'gss']).isValid()).toBe(true);
  });

  describe('accountingTenantId', () => {
    it('is required as soon as the default rate is above 0', () => {
      expect(courseFinanceValidations(finance({ defaultRate: new MoneyModel(100) })).getErrors('accountingTenantId')).toContain(PFX + 'booksRequired');
    });

    it('is required as soon as somebody is eligible, even at a rate of 0', () => {
      expect(courseFinanceValidations(finance({ eligible: [eligible('pA')] })).getErrors('accountingTenantId')).toContain(PFX + 'booksRequired');
    });

    it('is not required while nothing is set up', () => {
      expect(courseFinanceValidations(finance({ defaultRate: new MoneyModel(0), eligible: [] })).getErrors('accountingTenantId')).toEqual([]);
    });

    it('must be one of the books the tenant may use, when the list is known', () => {
      const f = finance({ accountingTenantId: 'other', defaultRate: new MoneyModel(100) });
      expect(courseFinanceValidations(f, ['scs', 'gss']).getErrors('accountingTenantId')).toContain(PFX + 'booksUnknown');
      expect(courseFinanceValidations(f).getErrors('accountingTenantId')).toEqual([]);
    });
  });

  describe('rates', () => {
    const base = { accountingTenantId: 'scs' };

    it('defaultRate: whole minor units, not negative', () => {
      expect(courseFinanceValidations(finance({ ...base, defaultRate: new MoneyModel(-1) })).getErrors('defaultRate')).toContain(PFX + 'rateInvalid');
      expect(courseFinanceValidations(finance({ ...base, defaultRate: new MoneyModel(10.5) })).getErrors('defaultRate')).toContain(PFX + 'rateInvalid');
      expect(courseFinanceValidations(finance({ ...base, defaultRate: new MoneyModel(Number.NaN) })).getErrors('defaultRate')).toContain(PFX + 'rateInvalid');
      expect(courseFinanceValidations(finance({ ...base, defaultRate: new MoneyModel(0) })).getErrors('defaultRate')).toEqual([]);
    });

    it('defaultRate: a missing value counts as 0 (legacy / coalesced by the server)', () => {
      expect(courseFinanceValidations(finance({ defaultRate: undefined as never })).getErrors('defaultRate')).toEqual([]);
    });

    it('a personal rate: not negative, whole minor units', () => {
      const f = finance({ ...base, eligible: [eligible('pA', new MoneyModel(-5)), eligible('pB', new MoneyModel(100)), eligible('pC', new MoneyModel(1.5))] });
      const result = courseFinanceValidations(f);
      expect(result.getErrors('eligible[0].rate')).toContain(PFX + 'rateInvalid');
      expect(result.getErrors('eligible[1].rate')).toEqual([]);
      expect(result.getErrors('eligible[2].rate')).toContain(PFX + 'rateInvalid');
    });

    it('a personal rate of 0 is a rate (unpaid), an absent one means the default', () => {
      const f = finance({ ...base, eligible: [eligible('pA', new MoneyModel(0)), eligible('pB')] });
      expect(courseFinanceValidations(f).isValid()).toBe(true);
    });

    it('an explicit null rate means the default, like the server reads it', () => {
      const f = finance({ ...base, eligible: [{ person: person('pA'), rate: null as never }] });
      expect(courseFinanceValidations(f).isValid()).toBe(true);
    });
  });

  describe('eligible', () => {
    const base = { accountingTenantId: 'scs' };

    it('rejects the same person twice', () => {
      const f = finance({ ...base, eligible: [eligible('pA'), eligible('pB'), eligible('pA', new MoneyModel(100))] });
      expect(courseFinanceValidations(f).getErrors('eligible')).toContain(PFX + 'duplicatePerson');
    });

    it('rejects a person without a key (a free-text entry cannot be paid)', () => {
      const f = finance({ ...base, eligible: [eligible('')] });
      expect(courseFinanceValidations(f).getErrors('eligible')).toContain(PFX + 'personRequired');
    });

    it('a legacy document without eligible is valid', () => {
      expect(courseFinanceValidations(finance({ eligible: undefined as never })).isValid()).toBe(true);
    });
  });
});
