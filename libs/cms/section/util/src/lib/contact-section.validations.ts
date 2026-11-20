import { enforce, staticSuite, test } from 'vest';

import { CONTACT_ELEMENTS, CONTACT_LAYOUTS, ContactSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { CONTACT_MAX_COLUMNS, CONTACT_MAX_ROWS, CONTACT_MAX_WIDTH } from './contact-section.util';

// The layout is edited by drag and drop and the keys by pickers, so only a hand-edited document
// can fail these; the messages reuse the generic `validation.invalidEnum` / `invalidValue` keys.
export const contactSectionValidations = staticSuite((model: ContactSection) => {
  baseSectionValidations(model);
  const config = model.properties;

  test('contact.layout', 'invalidEnum', () => {
    enforce((CONTACT_LAYOUTS as readonly string[]).includes(config?.layout)).isTruthy();
  });

  test('contact.rows', 'invalidValue', () => {
    const rows = config?.rows ?? [];
    enforce(rows.length >= 1 && rows.length <= CONTACT_MAX_ROWS).isTruthy();
    const known = new Set<string>(CONTACT_ELEMENTS);
    const seen = new Set<string>();
    for (const row of rows) {
      enforce(row.columns.length >= 1 && row.columns.length <= CONTACT_MAX_COLUMNS).isTruthy();
      for (const column of row.columns) {
        enforce(Number.isInteger(column.width) && column.width >= 1 && column.width <= CONTACT_MAX_WIDTH).isTruthy();
        for (const element of column.elements) {
          enforce(known.has(element) && !seen.has(element)).isTruthy();
          seen.add(element);
        }
      }
    }
  });

  test('contact.formFields', 'invalidValue', () => {
    // a form without a single visible field cannot be sent
    enforce(!config?.showForm || (config.formFields ?? []).some(f => f.isVisible)).isTruthy();
  });
});
