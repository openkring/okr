import { enforce, staticSuite, test } from 'vest';

import { EMAIL_LENGTH } from '@okr/shared-constants';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.
const VPFX = '@finance/collection/feature.validation.';

/** The «Rechnungs-E-Mail» dialog: the address the billing mails and the Stripe customer use. */
export interface BillingEmailFormModel {
  email: string;
}

/** The longest billing e-mail the dialog takes; the template's maxLength binds this very constant. */
export const BILLING_EMAIL_LENGTH = EMAIL_LENGTH;

// Same pattern setBillingEmail checks on the server.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors setBillingEmail: a mandatory address of the form name@domain.tld, at most BILLING_EMAIL_LENGTH characters. */
export const billingEmailValidations = staticSuite((model: BillingEmailFormModel) => {
  const email = typeof model.email === 'string' ? model.email.trim() : '';
  test('email', VPFX + 'email_required', () => {
    enforce(email).isNotBlank();
  });
  test('email', VPFX + 'email_invalid', () => {
    enforce(email === '' || EMAIL_RE.test(email)).isTruthy();
  });
  test('email', VPFX + 'email_too_long', () => {
    enforce(email.length <= BILLING_EMAIL_LENGTH).isTruthy();
  });
});
