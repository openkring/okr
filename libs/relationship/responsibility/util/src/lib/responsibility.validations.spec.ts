import { describe, expect, it } from 'vitest';

import { ResponsibilityModel } from '@okr/shared-models';

import { responsibilityValidations } from './responsibility.validations';

const withEmail = (email: unknown): ResponsibilityModel =>
  ({ ...new ResponsibilityModel('scs'), email }) as unknown as ResponsibilityModel;

describe('responsibilityValidations – email', () => {
  it('accepts an empty email (optional)', () => {
    expect(responsibilityValidations(withEmail(''), 'scs').hasErrors('email')).toBe(false);
  });

  it('accepts a legacy doc without email', () => {
    expect(responsibilityValidations(withEmail(undefined), 'scs').hasErrors('email')).toBe(false);
  });

  it('accepts a club alias', () => {
    expect(responsibilityValidations(withEmail('praesident@seeclub.org'), 'scs').hasErrors('email')).toBe(false);
  });

  it('flags a malformed address', () => {
    expect(responsibilityValidations(withEmail('praesident'), 'scs').hasErrors('email')).toBe(true);
  });

  it('flags an address over the length cap', () => {
    expect(responsibilityValidations(withEmail('a'.repeat(60) + '@club.ch'), 'scs').hasErrors('email')).toBe(true);
  });
});
