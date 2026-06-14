import { describe, expect, it } from 'vitest';
import { SLIDER_SECTION_SHAPE, SliderSection } from '@bk2/shared-models';

import { sliderSectionValidations } from './slider-section.validations';

describe('sliderSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(sliderSectionValidations({ ...SLIDER_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...SLIDER_SECTION_SHAPE, title: 123 } as unknown as SliderSection;
    expect(sliderSectionValidations(model).hasErrors('title')).toBe(true);
  });
});
