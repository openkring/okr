import { enforce, omitWhen, staticSuite, test } from 'vest';
import { ApplicationModel } from '@okr/shared-models';
import { ssnValidations } from '@okr/subject-person-util';
import { isMembershipApplication, needsGuardian, needsSsn } from './application.util';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.
const PFX = '@subject/application/feature.validation.';
const REQUIRED      = PFX + 'required';
const CHOICE        = PFX + 'choice';
const DATE_OF_BIRTH = PFX + 'date_of_birth';
const EMAIL_INVALID = PFX + 'email_invalid';
const NUMBER        = PFX + 'number';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates an application (membership request) in the edit modal. */
export const applicationValidations = staticSuite((app: ApplicationModel) => {
  // a course registration (spec 1.125 §13.2) is no membership request: the course form asks for no
  // address, no kind (`applicationAs`) and no AHV number, so those are required for memberships only
  const membership = isMembershipApplication(app);

  test('firstName',     REQUIRED,      () => { enforce(app.firstName).isNotBlank(); });
  test('lastName',      REQUIRED,      () => { enforce(app.lastName).isNotBlank(); });
  test('gender',        CHOICE,        () => { enforce(app.gender).inside(['male', 'female']); });
  test('dateOfBirth',   DATE_OF_BIRTH, () => { enforce(app.dateOfBirth).matches(/^\d{8}$/); });
  omitWhen(!membership, () => {
    test('streetName',    REQUIRED,      () => { enforce(app.streetName).isNotBlank(); });
    test('streetNumber',  REQUIRED,      () => { enforce(app.streetNumber).isNotBlank(); });
    test('zipCode',       REQUIRED,      () => { enforce(app.zipCode).isNotBlank(); });
    test('city',          REQUIRED,      () => { enforce(app.city).isNotBlank(); });
    test('countryCode',   REQUIRED,      () => { enforce(app.countryCode).isNotBlank(); });
    test('applicationAs', CHOICE,        () => { enforce(app.applicationAs).inside(['youth', 'adult', 'transfer']); });
  });

  omitWhen(!membership || !needsSsn(app), () => {
    test('ssnId', REQUIRED, () => { enforce(app.ssnId).isNotBlank(); });
    ssnValidations('ssnId', app.ssnId);
  });

  // typed properties (spec 1.125 §4.4): a corrected number must still be a number.
  // Filed under the value's own path, so the error note sits under that input.
  (app.properties ?? []).forEach((property, index) => {
    omitWhen(property.type !== 'number', () => {
      test(`properties[${index}].value`, NUMBER, () => { enforce(Number.isFinite(property.value)).isTruthy(); });
    });
  });

  omitWhen(!app.email,       () => { test('email',       EMAIL_INVALID, () => { enforce(app.email).matches(EMAIL_RE); }); });
  omitWhen(!app.parentEmail, () => { test('parentEmail', EMAIL_INVALID, () => { enforce(app.parentEmail).matches(EMAIL_RE); }); });

  // The guardian's names are required under 18 (by year of birth) — the age at which the SCS
  // application form shows its guardian block — not for every youth application: an 18- or
  // 19-year-old junior applies without one, and must still be saveable here.
  omitWhen(!needsGuardian(app), () => {
    test('parentFirstName', REQUIRED, () => { enforce(app.parentFirstName).isNotBlank(); });
    test('parentLastName',  REQUIRED, () => { enforce(app.parentLastName).isNotBlank(); });
  });

  // A youth application or a minor may give the guardian's e-mail/phone instead of their own.
  // A course registration asks for the e-mail only (its phone is optional): own or guardian's.
  if (!membership) {
    test('email', PFX + 'email_required', () => {
      enforce(!!app.email || !!app.parentEmail).isTruthy();
    });
  } else if (app.applicationAs !== 'youth' && !needsGuardian(app)) {
    test('email', REQUIRED, () => { enforce(app.email).isNotBlank(); });
    test('phone', REQUIRED, () => { enforce(app.phone).isNotBlank(); });
  } else {
    test('email', PFX + 'email_required', () => {
      enforce(!!app.email || !!app.parentEmail).isTruthy();
    });
    test('phone', PFX + 'phone_required', () => {
      enforce(!!app.phone || !!app.parentPhone).isTruthy();
    });
  }
});
