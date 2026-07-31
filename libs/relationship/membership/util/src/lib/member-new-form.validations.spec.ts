import { describe, expect, it } from 'vitest';

import { MEMBER_NEW_FORM_SHAPE, MemberNewFormModel } from './member-new-form.model';
import { memberNewFormValidations } from './member-new-form.validations';

function makeMember(overrides: Partial<MemberNewFormModel> = {}): MemberNewFormModel {
  return {
    ...MEMBER_NEW_FORM_SHAPE,
    firstName: 'Anna',
    lastName: 'Muster',
    ...overrides,
  };
}

function errorsFor(model: MemberNewFormModel, field: string): string[] {
  return memberNewFormValidations(model).getErrors(field);
}

describe('memberNewFormValidations date fields', () => {
  it('accepts a year-only date of birth', () => {
    expect(errorsFor(makeMember({ dateOfBirth: '19850000' }), 'dateOfBirth')).toHaveLength(0);
  });

  it('accepts a birthday without a year', () => {
    expect(errorsFor(makeMember({ dateOfBirth: '00000415' }), 'dateOfBirth')).toHaveLength(0);
  });

  it('still rejects a malformed date of birth', () => {
    expect(errorsFor(makeMember({ dateOfBirth: '00000000' }), 'dateOfBirth').length).toBeGreaterThan(0);
    expect(errorsFor(makeMember({ dateOfBirth: '19850229' }), 'dateOfBirth').length).toBeGreaterThan(0);
  });

  it('rejects a death year before a year-only birth year', () => {
    const model = makeMember({ dateOfBirth: '19850000', dateOfDeath: '19800101' });
    expect(errorsFor(model, 'dateOfDeath').length).toBeGreaterThan(0);
  });

  it('allows birth and death in the same year at year granularity', () => {
    const model = makeMember({ dateOfBirth: '19850000', dateOfDeath: '19850415' });
    expect(errorsFor(model, 'dateOfDeath')).toHaveLength(0);
  });
});
