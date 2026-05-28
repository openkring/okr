import { create, enforce, omitWhen, test } from 'vest';
import { ApplicationModel } from '@bk2/shared-models';
import { ssnValidations } from '@bk2/subject-person-util';
import { needsSsn } from './application.util';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const applicationValidationSuite = create((app: ApplicationModel, field?: string) => {
  test('firstName',     '@application/field.first_name',     () => { enforce(app.firstName).isNotBlank(); });
  test('lastName',      '@application/field.last_name',      () => { enforce(app.lastName).isNotBlank(); });
  test('gender',        '@application/field.gender',         () => { enforce(app.gender).inside(['male', 'female']); });
  test('dateOfBirth',   '@application/field.date_of_birth',  () => { enforce(app.dateOfBirth).matches(/^\d{8}$/); });
  test('streetName',    '@application/field.street_name',    () => { enforce(app.streetName).isNotBlank(); });
  test('streetNumber',  '@application/field.street_number',  () => { enforce(app.streetNumber).isNotBlank(); });
  test('zipCode',       '@application/field.zip_code',       () => { enforce(app.zipCode).isNotBlank(); });
  test('city',          '@application/field.city',           () => { enforce(app.city).isNotBlank(); });
  test('countryCode',   '@application/field.country_code',   () => { enforce(app.countryCode).isNotBlank(); });
  test('applicationAs', '@application/field.application_as', () => { enforce(app.applicationAs).inside(['youth', 'adult', 'transfer']); });

  omitWhen(!needsSsn(app), () => {
    test('ssnId', '@application/field.ssn', () => { enforce(app.ssnId).isNotBlank(); });
    ssnValidations('ssnId', app.ssnId);
  });

  omitWhen(!app.email,       () => { test('email',       '@application/field.email',        () => { enforce(app.email).matches(EMAIL_RE); }); });
  omitWhen(!app.parentEmail, () => { test('parentEmail', '@application/field.parent_email', () => { enforce(app.parentEmail).matches(EMAIL_RE); }); });

  if (app.applicationAs !== 'youth') {
    test('email', '@application/field.email', () => { enforce(app.email).isNotBlank(); });
    test('phone', '@application/field.phone', () => { enforce(app.phone).isNotBlank(); });
  } else {
    test('parentFirstName', '@application/field.parent_first_name', () => { enforce(app.parentFirstName).isNotBlank(); });
    test('parentLastName',  '@application/field.parent_last_name',  () => { enforce(app.parentLastName).isNotBlank(); });

    test('email', '@application/validation.email_required_either', () => {
      enforce(!!app.email || !!app.parentEmail).isTruthy();
    });
    test('phone', '@application/validation.phone_required_either', () => {
      enforce(!!app.phone || !!app.parentPhone).isTruthy();
    });
  }
});
