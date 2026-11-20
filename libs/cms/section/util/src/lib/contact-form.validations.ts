import { enforce, omitWhen, staticSuite, test } from 'vest';

import { COMMENT_LENGTH, EMAIL_LENGTH, NAME_LENGTH, PHONE_LENGTH } from '@okr/shared-constants';
import { ContactFormField, ContactFormFieldName } from '@okr/shared-models';

/** What a visitor types into the contact form. Never stored: it only fills a mailto: link. */
export type ContactFormModel = Record<ContactFormFieldName, string>;

export const CONTACT_FORM_MODEL_SHAPE: ContactFormModel = { firstName: '', lastName: '', email: '', phone: '', message: '' };

/** The caps the form's `[maxLength]` binds to. */
export const CONTACT_FORM_MAX_LENGTH: Record<ContactFormFieldName, number> = {
  firstName: NAME_LENGTH,
  lastName: NAME_LENGTH,
  email: EMAIL_LENGTH,
  phone: PHONE_LENGTH,
  message: COMMENT_LENGTH,
};

const PFX = '@cms/section/feature.contact.form.error.';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The visitor's contact form. `fields` is the section's field configuration: a hidden field is
 * not validated at all, a required one must not be blank.
 */
export const contactFormValidations = staticSuite((model: ContactFormModel, fields: ContactFormField[] = []) => {
  for (const field of fields) {
    if (!field.isVisible) continue;
    const value = model?.[field.name] ?? '';
    omitWhen(!field.isRequired, () => {
      test(field.name, PFX + 'required', () => {
        enforce(value.trim()).isNotBlank();
      });
    });
    test(field.name, 'tooLong', () => {
      enforce(value.length <= CONTACT_FORM_MAX_LENGTH[field.name]).isTruthy();
    });
    if (field.name === 'email') {
      omitWhen(value.trim() === '', () => {
        test('email', PFX + 'email', () => {
          enforce(EMAIL_PATTERN.test(value.trim())).isTruthy();
        });
      });
    }
  }
});
