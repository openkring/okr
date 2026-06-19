// libs/pdf-template/util/src/lib/email-composer.validations.ts
import { enforce, only, staticSuite, test } from 'vest';
import { parseEmails } from './email-html.util';

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

  test('to', 'Mindestens eine Empfängeradresse ist erforderlich.', () => {
    enforce(parseEmails(model.to).length).greaterThan(0);
  });
  test('to', 'Ungültige Empfängeradresse.', () => {
    enforce(parseEmails(model.to).every(looksLikeEmail)).isTruthy();
  });

  test('from', 'Absenderadresse ist erforderlich.', () => {
    enforce(model.from).isNotBlank();
  });
  test('from', 'Ungültige Absenderadresse.', () => {
    enforce(looksLikeEmail(model.from)).isTruthy();
  });

  test('subject', 'Betreff ist erforderlich.', () => {
    enforce(model.subject).isNotBlank();
  });

  test('cc', 'Ungültige CC-Adresse.', () => {
    enforce(parseEmails(model.cc).every(looksLikeEmail)).isTruthy();
  });
  test('bcc', 'Ungültige BCC-Adresse.', () => {
    enforce(parseEmails(model.bcc).every(looksLikeEmail)).isTruthy();
  });
});
