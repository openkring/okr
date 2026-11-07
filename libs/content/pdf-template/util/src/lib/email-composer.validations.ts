// libs/content/pdf-template/util/src/lib/email-composer.validations.ts
import { enforce, staticSuite, test } from 'vest';
import type { EmailLayoutChoice } from '@okr/shared-models';
import { emailBodyHasContent, parseEmails } from './email-html.util';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.

/** Form model backing the email composer modal. */
export interface EmailComposerFormModel {
  to: string;       // comma-separated recipient addresses
  from: string;     // single sender address
  cc: string;       // comma-separated
  bcc: string;      // comma-separated
  subject: string;
  body: string;     // html body
  layout: EmailLayoutChoice;  // which frame the server wraps the body in
  caleventKeys: string[];     // Versand only: events whose personal answer link is mailed; no validation rule
}

/** Lightweight email shape check (matches the auth credential suite style). */
function looksLikeEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}

/** `hasAttachment`: the mail carries a document or file, whose note gives it content without a body. */
export const emailComposerValidations = staticSuite((model: EmailComposerFormModel, hasAttachment = false) => {
  test('to', '@content/pdf-template/feature.validation.to_required', () => {
    enforce(parseEmails(model.to).length).greaterThan(0);
  });
  test('to', '@content/pdf-template/feature.validation.to_invalid', () => {
    enforce(parseEmails(model.to).every(looksLikeEmail)).isTruthy();
  });

  test('from', '@content/pdf-template/feature.validation.from_required', () => {
    enforce(model.from).isNotBlank();
  });
  test('from', '@content/pdf-template/feature.validation.from_invalid', () => {
    enforce(looksLikeEmail(model.from)).isTruthy();
  });

  test('subject', '@content/pdf-template/feature.validation.subject_required', () => {
    enforce(model.subject).isNotBlank();
  });

  test('body', '@content/pdf-template/feature.validation.body_required', () => {
    enforce(hasAttachment || emailBodyHasContent(model.body)).isTruthy();
  });

  test('cc', '@content/pdf-template/feature.validation.cc_invalid', () => {
    enforce(parseEmails(model.cc).every(looksLikeEmail)).isTruthy();
  });
  test('bcc', '@content/pdf-template/feature.validation.bcc_invalid', () => {
    enforce(parseEmails(model.bcc).every(looksLikeEmail)).isTruthy();
  });
});
