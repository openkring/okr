import { describe, expect, it } from 'vitest';
import { BUTTON_SECTION_SHAPE, ButtonAction, ButtonSection } from '@okr/shared-models';

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

  it('does not throw for a section whose properties lack icon/style/action', () => {
    const model = { ...BUTTON_SECTION_SHAPE, properties: {} } as unknown as ButtonSection;
    expect(() => buttonSectionValidations(model)).not.toThrow();
  });

  describe('ContractDocument action (spec 1.97)', () => {
    const withAction = (type: ButtonAction, url: string) =>
      ({ ...BUTTON_SECTION_SHAPE, properties: { ...BUTTON_SECTION_SHAPE.properties, action: { type, url, altText: '' } } }) as ButtonSection;

    it('requires a contract', () => {
      expect(buttonSectionValidations(withAction(ButtonAction.ContractDocument, '')).hasErrors('action.url')).toBe(true);
    });
    it('accepts a contract key', () => {
      expect(buttonSectionValidations(withAction(ButtonAction.ContractDocument, 'ins_q3ribu6aoxdi22xlnz1f')).hasErrors('action.url')).toBe(false);
    });
    it('keeps an empty url allowed for a download button', () => {
      expect(buttonSectionValidations(withAction(ButtonAction.Download, '')).hasErrors('action.url')).toBe(false);
    });
  });
});
