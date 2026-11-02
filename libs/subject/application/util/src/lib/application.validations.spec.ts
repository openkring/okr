import { describe, expect, it } from 'vitest';
import { ApplicationModel } from '@okr/shared-models';
import { applicationValidations } from './application.validations';

function validAdult(patch: Partial<ApplicationModel> = {}): ApplicationModel {
  return {
    ...new ApplicationModel('scs'),
    firstName: 'Anna', lastName: 'Muster', gender: 'female', dateOfBirth: '19800101',
    email: 'anna@example.com', phone: '+41 79 123 45 67',
    streetName: 'Seestrasse', streetNumber: '1', zipCode: '8000', city: 'Zürich', countryCode: 'CH',
    applicationAs: 'adult',
    ...patch,
  };
}

describe('applicationValidations', () => {
  it('accepts a complete adult application', () => {
    expect(applicationValidations(validAdult()).isValid()).toBe(true);
  });

  it('requires the first and last name', () => {
    const result = applicationValidations(validAdult({ firstName: ' ', lastName: '' }));
    expect(result.hasErrors('firstName')).toBe(true);
    expect(result.hasErrors('lastName')).toBe(true);
  });

  it('requires a full 8-digit date of birth', () => {
    expect(applicationValidations(validAdult({ dateOfBirth: '1980' })).hasErrors('dateOfBirth')).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(applicationValidations(validAdult({ email: 'anna@' })).hasErrors('email')).toBe(true);
  });

  it('requires email and phone for an adult', () => {
    const result = applicationValidations(validAdult({ email: '', phone: '' }));
    expect(result.hasErrors('email')).toBe(true);
    expect(result.hasErrors('phone')).toBe(true);
  });

  it('accepts the parent email/phone for a youth application, but requires the parent name', () => {
    const youth = validAdult({
      applicationAs: 'youth', dateOfBirth: '20150101', email: '', phone: '', ssnId: '756.1234.5678.97',
      parentEmail: 'parent@example.com', parentPhone: '+41 79 000 00 00', parentFirstName: '', parentLastName: 'Muster',
    });
    const result = applicationValidations(youth);
    expect(result.hasErrors('email')).toBe(false);
    expect(result.hasErrors('phone')).toBe(false);
    expect(result.hasErrors('parentFirstName')).toBe(true);
  });

  describe('guardian (under 18, by year of birth)', () => {
    const year = new Date().getFullYear();
    const born = (age: number) => `${year - age}0101`;
    const youth = (age: number, patch: Partial<ApplicationModel> = {}) => validAdult({
      applicationAs: 'youth', dateOfBirth: born(age), ssnId: '756.1234.5678.97',
      parentFirstName: '', parentLastName: '', ...patch,
    });

    it('requires the guardian names under 18', () => {
      const result = applicationValidations(youth(17));
      expect(result.hasErrors('parentFirstName')).toBe(true);
      expect(result.hasErrors('parentLastName')).toBe(true);
    });

    it('does not require them from 18 on, also for a youth application', () => {
      for (const age of [18, 19]) {
        const result = applicationValidations(youth(age));
        expect(result.hasErrors('parentFirstName')).toBe(false);
        expect(result.hasErrors('parentLastName')).toBe(false);
        expect(result.isValid()).toBe(true);
      }
    });

    it('requires them under 18 even when the application is not marked youth', () => {
      const result = applicationValidations(validAdult({ applicationAs: 'adult', dateOfBirth: born(16), ssnId: '756.1234.5678.97' }));
      expect(result.hasErrors('parentFirstName')).toBe(true);
    });

    it('accepts the guardian contact instead of the own one under 18', () => {
      const result = applicationValidations(youth(15, {
        email: '', phone: '', parentFirstName: 'Paul', parentLastName: 'Muster',
        parentEmail: 'paul@example.com', parentPhone: '+41 79 000 00 00',
      }));
      expect(result.isValid()).toBe(true);
    });
  });

  it('requires the ssn for a youth application', () => {
    const youth = validAdult({
      applicationAs: 'youth', dateOfBirth: '20150101', ssnId: '',
      parentFirstName: 'Paul', parentLastName: 'Muster',
    });
    expect(applicationValidations(youth).hasErrors('ssnId')).toBe(true);
  });

  it('rejects a number property that is not a number, filed under its value', () => {
    const app = validAdult({ properties: [
      { key: 'canSwim300m', type: 'boolean', value: true, label: 'Ich kann 300m schwimmen' },
      { key: 'years',       type: 'number',  value: Number.NaN, label: 'Jahre' },
    ] });
    const result = applicationValidations(app);
    expect(result.hasErrors('properties[1].value')).toBe(true);
    expect(result.hasErrors('properties[0].value')).toBe(false);
  });

  it('accepts valid properties and a legacy application without properties', () => {
    const withProps = validAdult({ properties: [{ key: 'years', type: 'number', value: 2, label: 'Jahre' }] });
    expect(applicationValidations(withProps).isValid()).toBe(true);
    const legacy = { ...validAdult(), properties: undefined } as unknown as ApplicationModel;
    expect(applicationValidations(legacy).isValid()).toBe(true);
  });
});
