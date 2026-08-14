// libs/pdf-template/util/src/lib/email-composer.validations.ts
import { enforce, only, staticSuite, test } from 'vest';
import { parseEmails } from './email-html.util';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.

/** Form model backing the email composer modal. */
export interface EmailComposerFormModel {
  to: string;       // comma-separated recipient addresses
  from: string;     // single sender address
  cc: string;       // comma-separated
  bcc: string;      // comma-separated
  subject: string;
  body: string;     // html body
}

/** Lightweight email shape check (matches the auth credential suite style). */
function looksLikeEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}

export const emailComposerValidations = staticSuite((model: EmailComposerFormModel, field?: string) => {
  if (field) only(field);

  test('to', '@pdf-template/feature.validation.to_required', () => {
    enforce(parseEmails(model.to).length).greaterThan(0);
  });
  test('to', '@pdf-template/feature.validation.to_invalid', () => {
    enforce(parseEmails(model.to).every(looksLikeEmail)).isTruthy();
  });

  test('from', '@pdf-template/feature.validation.from_required', () => {
    enforce(model.from).isNotBlank();
  });
  test('from', '@pdf-template/feature.validation.from_invalid', () => {
    enforce(looksLikeEmail(model.from)).isTruthy();
  });

  test('subject', '@pdf-template/feature.validation.subject_required', () => {
    enforce(model.subject).isNotBlank();
  });

  test('cc', '@pdf-template/feature.validation.cc_invalid', () => {
    enforce(parseEmails(model.cc).every(looksLikeEmail)).isTruthy();
  });
  test('bcc', '@pdf-template/feature.validation.bcc_invalid', () => {
    enforce(parseEmails(model.bcc).every(looksLikeEmail)).isTruthy();
  });
});
