import { describe, expect, it } from 'vitest';

import { HouseholdModel } from '@okr/shared-models';

import { householdValidations } from './household.validations';

function household(patch: Partial<HouseholdModel> = {}): HouseholdModel {
  return { ...new HouseholdModel('scs'), okey: 'h1', name: 'Familie Muster', memberKeys: ['p1', 'p2'], payerKey: 'p1', contactKey: 'p2', ...patch };
}

describe('householdValidations', () => {
  it('accepts a complete household', () => {
    expect(householdValidations(household()).isValid()).toBe(true);
  });

  it('requires a name', () => {
    const result = householdValidations(household({ name: '' }));
    expect(result.hasErrors('name')).toBe(true);
  });

  it('refuses a payer outside the members', () => {
    const result = householdValidations(household({ payerKey: 'p9' }));
    expect(result.hasErrors('payerKey')).toBe(true);
  });

  it('refuses a contact outside the members', () => {
    const result = householdValidations(household({ contactKey: 'p9' }));
    expect(result.hasErrors('contactKey')).toBe(true);
  });

  it('accepts an empty payer with two members (one invoice per person)', () => {
    const result = householdValidations(household({ payerKey: '' }));
    expect(result.isValid()).toBe(true);
  });

  it('requires a contact once there are two members', () => {
    const result = householdValidations(household({ contactKey: '' }));
    expect(result.hasErrors('contactKey')).toBe(true);
    expect(result.hasErrors('payerKey')).toBe(false);
  });

  it('requires two members for a new household', () => {
    const result = householdValidations(household({ okey: '', memberKeys: ['p1'], payerKey: '', contactKey: '' }));
    expect(result.hasErrors('memberKeys')).toBe(true);
  });

  it('lets an existing household shrink below two members (the server then archives it)', () => {
    const result = householdValidations(household({ memberKeys: ['p1'], payerKey: '', contactKey: '' }));
    expect(result.isValid()).toBe(true);
  });

  it('refuses a person listed twice', () => {
    const result = householdValidations(household({ memberKeys: ['p1', 'p2', 'p1'] }));
    expect(result.hasErrors('memberKeys')).toBe(true);
  });

  it('files the failures under scoped i18n keys', () => {
    const result = householdValidations(household({ payerKey: 'p9' }));
    expect(result.getErrors('payerKey')).toContain('@relationship/household/feature.validation.payer_not_member');
  });
});
