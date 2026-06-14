import { describe, expect, it } from 'vitest';
import { BUTTON_SECTION_SHAPE, ButtonSection } from '@bk2/shared-models';

import { buttonSectionValidations } from './button-section.validations';

describe('buttonSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(buttonSectionValidations({ ...BUTTON_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...BUTTON_SECTION_SHAPE, title: 123 } as unknown as ButtonSection;
    expect(buttonSectionValidations(model).hasErrors('title')).toBe(true);
  });

  it('flags a non-string button label', () => {
    const model = { ...BUTTON_SECTION_SHAPE, properties: { ...BUTTON_SECTION_SHAPE.properties, style: { ...BUTTON_SECTION_SHAPE.properties.style, label: 123 } } } as unknown as ButtonSection;
    expect(buttonSectionValidations(model).hasErrors('style.label')).toBe(true);
  });
});
