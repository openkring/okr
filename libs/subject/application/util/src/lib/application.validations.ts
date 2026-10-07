import { enforce, omitWhen, staticSuite, test } from 'vest';
import { ApplicationModel } from '@okr/shared-models';
import { ssnValidations } from '@okr/subject-person-util';
import { needsSsn } from './application.util';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.
const PFX = '@subject/application/feature.validation.';
const REQUIRED      = PFX + 'required';
const CHOICE        = PFX + 'choice';
const DATE_OF_BIRTH = PFX + 'date_of_birth';
const EMAIL_INVALID = PFX + 'email_invalid';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates an application (membership request) in the edit modal. */
export const applicationValidations = staticSuite((app: ApplicationModel) => {

  test('firstName',     REQUIRED,      () => { enforce(app.firstName).isNotBlank(); });
  test('lastName',      REQUIRED,      () => { enforce(app.lastName).isNotBlank(); });
  test('gender',        CHOICE,        () => { enforce(app.gender).inside(['male', 'female']); });
  test('dateOfBirth',   DATE_OF_BIRTH, () => { enforce(app.dateOfBirth).matches(/^\d{8}$/); });
  test('streetName',    REQUIRED,      () => { enforce(app.streetName).isNotBlank(); });
  test('streetNumber',  REQUIRED,      () => { enforce(app.streetNumber).isNotBlank(); });
  test('zipCode',       REQUIRED,      () => { enforce(app.zipCode).isNotBlank(); });
  test('city',          REQUIRED,      () => { enforce(app.city).isNotBlank(); });
  test('countryCode',   REQUIRED,      () => { enforce(app.countryCode).isNotBlank(); });
  test('applicationAs', CHOICE,        () => { enforce(app.applicationAs).inside(['youth', 'adult', 'transfer']); });

  omitWhen(!needsSsn(app), () => {
    test('ssnId', REQUIRED, () => { enforce(app.ssnId).isNotBlank(); });
    ssnValidations('ssnId', app.ssnId);
  });

  omitWhen(!app.email,       () => { test('email',       EMAIL_INVALID, () => { enforce(app.email).matches(EMAIL_RE); }); });
  omitWhen(!app.parentEmail, () => { test('parentEmail', EMAIL_INVALID, () => { enforce(app.parentEmail).matches(EMAIL_RE); }); });

  if (app.applicationAs !== 'youth') {
    test('email', REQUIRED, () => { enforce(app.email).isNotBlank(); });
    test('phone', REQUIRED, () => { enforce(app.phone).isNotBlank(); });
  } else {
    test('parentFirstName', REQUIRED, () => { enforce(app.parentFirstName).isNotBlank(); });
    test('parentLastName',  REQUIRED, () => { enforce(app.parentLastName).isNotBlank(); });

    test('email', PFX + 'email_required', () => {
      enforce(!!app.email || !!app.parentEmail).isTruthy();
    });
    test('phone', PFX + 'phone_required', () => {
      enforce(!!app.phone || !!app.parentPhone).isTruthy();
    });
  }
});
