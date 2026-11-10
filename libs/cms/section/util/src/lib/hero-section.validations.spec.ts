import { describe, expect, it } from 'vitest';
import { HERO_SECTION_SHAPE, HeroSection } from '@okr/shared-models';

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

describe('heroSectionValidations ctas', () => {
  const withCtas = (ctas: unknown) =>
    ({ ...HERO_SECTION_SHAPE, properties: { ...HERO_SECTION_SHAPE.properties, ctas } }) as unknown as HeroSection;
  const cta = (over = {}) => ({ label: 'Los', url: '#a', style: 'primary', ...over });

  it('does not flag a hero without ctas', () => {
    expect(heroSectionValidations({ ...HERO_SECTION_SHAPE }).hasErrors('ctas')).toBe(false);
  });

  it('accepts two valid ctas', () => {
    expect(heroSectionValidations(withCtas([cta(), cta()])).hasErrors('ctas')).toBe(false);
  });

  it('flags more than two ctas', () => {
    expect(heroSectionValidations(withCtas([cta(), cta(), cta()])).hasErrors('ctas')).toBe(true);
  });

  it('flags an empty label or an unsafe url', () => {
    expect(heroSectionValidations(withCtas([cta({ label: '' })])).hasErrors('ctas[0].label')).toBe(true);
    expect(heroSectionValidations(withCtas([cta({ url: 'javascript:x' })])).hasErrors('ctas[0].url')).toBe(true);
  });
});
