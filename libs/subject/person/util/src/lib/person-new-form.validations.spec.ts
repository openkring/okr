import { describe, expect, it, vi } from 'vitest';

// personNewFormValidations -> ssnValidations imports checkAhv/isBlankAhv from @okr/shared-util-angular,
// whose barrel transitively pulls in @ionic/angular. Stand in for them here (the real EAN13 check
// and blank detection are covered in ahv.util.spec) so these pure-suite tests don't load Ionic.
vi.mock('@okr/shared-util-angular', () => ({
  checkAhv: vi.fn((value: string | number) => /^756\d{10}$/.test(String(value).replace(/\D/g, ''))),
  isBlankAhv: vi.fn((value: string | number | undefined | null) => {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length === 0 || '756'.startsWith(digits);
  }),
}));

import { PERSON_NEW_FORM_SHAPE, PersonNewFormModel } from './person-new-form.model';
import { personNewFormValidations } from './person-new-form.validations';

function makePerson(overrides: Partial<PersonNewFormModel> = {}): PersonNewFormModel {
  return {
    ...PERSON_NEW_FORM_SHAPE,
    firstName: 'Anna',
    lastName: 'Muster',
    ...overrides,
  };
}

function errorsFor(model: PersonNewFormModel, field: string): string[] {
  return personNewFormValidations(model).getErrors(field);
}

describe('personNewFormValidations date fields', () => {
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

  it('rejects a death year before a year-only birth year', () => {
    const model = makePerson({ dateOfBirth: '19850000', dateOfDeath: '19800101' });
    expect(errorsFor(model, 'dateOfDeath').length).toBeGreaterThan(0);
  });

  it('allows birth and death in the same year at year granularity', () => {
    const model = makePerson({ dateOfBirth: '19850000', dateOfDeath: '19850415' });
    expect(errorsFor(model, 'dateOfDeath')).toHaveLength(0);
  });
});
