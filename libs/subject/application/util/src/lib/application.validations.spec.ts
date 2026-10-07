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

  it('requires the ssn for a youth application', () => {
    const youth = validAdult({
      applicationAs: 'youth', dateOfBirth: '20150101', ssnId: '',
      parentFirstName: 'Paul', parentLastName: 'Muster',
    });
    expect(applicationValidations(youth).hasErrors('ssnId')).toBe(true);
  });
});
