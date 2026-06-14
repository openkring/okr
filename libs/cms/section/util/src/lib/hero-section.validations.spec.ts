import { describe, expect, it } from 'vitest';
import { HERO_SECTION_SHAPE, HeroSection } from '@bk2/shared-models';

import { heroSectionValidations } from './hero-section.validations';

describe('heroSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(heroSectionValidations({ ...HERO_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...HERO_SECTION_SHAPE, title: 123 } as unknown as HeroSection;
    expect(heroSectionValidations(model).hasErrors('title')).toBe(true);
  });
});
