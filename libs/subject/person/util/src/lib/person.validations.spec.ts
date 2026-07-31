import { describe, expect, it, vi } from 'vitest';

import { PersonModel } from '@okr/shared-models';

// person.validations -> ssn.validations imports checkAhv/isBlankAhv from @okr/shared-util-angular,
// whose barrel transitively pulls in @ionic/angular. Stand in for them here (the real EAN13 check
// and blank detection are covered in ahv.util.spec) so these pure-suite tests don't load Ionic.
vi.mock('@okr/shared-util-angular', () => ({
  checkAhv: vi.fn((value: string | number) => /^756\d{10}$/.test(String(value).replace(/\D/g, ''))),
  isBlankAhv: vi.fn((value: string | number | undefined | null) => {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length === 0 || '756'.startsWith(digits);
  }),
}));

import { isValidForFields } from '@okr/shared-util-core';

import { PersonFormModel } from './person-form.model';
import { personValidations } from './person.validations';

const tenantId = 'scs';
const tags = '';

function formModel(overrides: Partial<PersonFormModel> = {}): PersonFormModel {
  const person = new PersonModel(tenantId) as PersonFormModel;
  person.okey = 'person-1';
  person.firstName = 'John';
  person.lastName = 'Doe';
  person.index = 'n:Doe fn:John';
  return { ...person, ...overrides };
}

describe('personValidations: ssnId', () => {

  // The AHV number is optional: clearing the field must leave the form savable, i.e. the
  // change-confirmation bar (valid && dirty) has to stay reachable.
  it('is valid when the ssn is empty', () => {
    const result = personValidations(formModel({ ssnId: '' }), tenantId, tags);
    expect(result.getErrors('ssnId')).toEqual([]);
    expect(result.isValid()).toBe(true);
  });

  it('is valid when the ssn is absent', () => {
    const result = personValidations(formModel({ ssnId: undefined }), tenantId, tags);
    expect(result.getErrors('ssnId')).toEqual([]);
    expect(result.isValid()).toBe(true);
  });

  it('is valid for a complete ahv number, in either notation', () => {
    expect(personValidations(formModel({ ssnId: '756.0803.5816.61' }), tenantId, tags).isValid()).toBe(true);
    expect(personValidations(formModel({ ssnId: '7560803581661' }), tenantId, tags).isValid()).toBe(true);
  });

  // Regression: personValidations used to run a plain stringValidations on ssnId, so the
  // checkAhv test never ran and a wrong number produced no error note at all.
  it('reports an incomplete or wrong ahv number', () => {
    const result = personValidations(formModel({ ssnId: '756292318310' }), tenantId, tags);
    expect(result.getErrors('ssnId')).toContain('@validation.validSSN');
    expect(result.isValid()).toBe(false);
  });

  // The profile page refused to save with the ssn cleared, and NOT because of the ssn: the person
  // carried legacy tags ('important' predates the '@tag.' prefix) that are no longer in the
  // tenant's configured list, so the model-wide suite was invalid on a field the profile form does
  // not even render. The accordion now gates on the fields it edits (see isValidForFields).
  it('lets the profile form save although unrendered fields (legacy tags) are invalid', () => {
    const person = formModel({ ssnId: '', tags: 'important,@tag.sponsor' });
    const configuredTags = '@tag.advertiser, @tag.bexio, @tag.important, @tag.sponsor';
    const result = personValidations(person, tenantId, configuredTags);

    expect(result.getErrors('tags[0]')).toContain('invalidValue');   // the legacy tag still reports
    expect(result.isValid()).toBe(false);                            // ...so the full suite is invalid
    expect(isValidForFields(result, ['ssnId'])).toBe(true);          // ...but the ssn form may save
  });

  // ChSsnMask opens with the literals '7','5','6','.', so deleting the field's content leaves
  // that scaffolding behind rather than ''. Treating it as an invalid number kept the suite
  // invalid, which hid the change-confirmation bar — an AHV number could never be removed again.
  it('is valid when only the mask scaffolding is left after clearing', () => {
    for (const cleared of ['756.', '756', '7', '75', '.']) {
      const result = personValidations(formModel({ ssnId: cleared }), tenantId, tags);
      expect(result.getErrors('ssnId'), `cleared as "${cleared}"`).toEqual([]);
      expect(result.isValid(), `cleared as "${cleared}"`).toBe(true);
    }
  });
});

function makePerson(overrides: Partial<PersonFormModel> = {}): PersonFormModel {
  return {
    ...new PersonModel(tenantId),
    firstName: 'Anna',
    lastName: 'Muster',
    dateOfBirth: '',
    dateOfDeath: '',
    ...overrides,
  };
}

function errorsFor(model: PersonFormModel, field: string): string[] {
  return personValidations(model, 't1', '').getErrors(field);
}

describe('personValidations date fields', () => {
  it('accepts a full date of birth', () => {
    expect(errorsFor(makePerson({ dateOfBirth: '19850415' }), 'dateOfBirth')).toHaveLength(0);
  });

  it('accepts a year-only date of birth', () => {
    expect(errorsFor(makePerson({ dateOfBirth: '19850000' }), 'dateOfBirth')).toHaveLength(0);
  });

  it('accepts a birthday without a year', () => {
    expect(errorsFor(makePerson({ dateOfBirth: '00000415' }), 'dateOfBirth')).toHaveLength(0);
  });

  it('still rejects a malformed date of birth', () => {
    expect(errorsFor(makePerson({ dateOfBirth: '00000000' }), 'dateOfBirth').length).toBeGreaterThan(0);
    expect(errorsFor(makePerson({ dateOfBirth: '19850229' }), 'dateOfBirth').length).toBeGreaterThan(0);
  });

  it('rejects a date of death before the date of birth', () => {
    const model = makePerson({ dateOfBirth: '19850415', dateOfDeath: '19800101' });
    expect(errorsFor(model, 'dateOfDeath').length).toBeGreaterThan(0);
  });

  it('rejects a death year before a year-only birth year', () => {
    const model = makePerson({ dateOfBirth: '19850000', dateOfDeath: '19800101' });
    expect(errorsFor(model, 'dateOfDeath').length).toBeGreaterThan(0);
  });

  it('allows birth and death in the same year at year granularity', () => {
    const model = makePerson({ dateOfBirth: '19850000', dateOfDeath: '19850415' });
    expect(errorsFor(model, 'dateOfDeath')).toHaveLength(0);
  });

  it('does not report a conflict when one side has no year', () => {
    const model = makePerson({ dateOfBirth: '00000415', dateOfDeath: '19800101' });
    expect(errorsFor(model, 'dateOfDeath')).toHaveLength(0);
  });
});
