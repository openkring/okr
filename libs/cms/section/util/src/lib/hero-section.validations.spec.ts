import { describe, expect, it } from 'vitest';
import { HERO_OVERLAY_DEFAULT, HERO_SECTION_SHAPE, HeroSection } from '@okr/shared-models';

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

describe('heroSectionValidations overlay and layout', () => {
  const withProps = (props: Record<string, unknown>) =>
    ({ ...HERO_SECTION_SHAPE, properties: { ...HERO_SECTION_SHAPE.properties, ...props } }) as unknown as HeroSection;
  const overlay = (over = {}) => ({ ...HERO_OVERLAY_DEFAULT, ...over });

  it('does not flag a hero without overlay, height or focus', () => {
    const r = heroSectionValidations({ ...HERO_SECTION_SHAPE });
    expect(r.hasErrors('overlay.darkening')).toBe(false);
    expect(r.hasErrors('height')).toBe(false);
    expect(r.hasErrors('focus')).toBe(false);
  });

  it('accepts darkening 0 and 80', () => {
    expect(heroSectionValidations(withProps({ overlay: overlay({ darkening: 0 }) })).hasErrors('overlay.darkening')).toBe(false);
    expect(heroSectionValidations(withProps({ overlay: overlay({ darkening: 80 }) })).hasErrors('overlay.darkening')).toBe(false);
  });

  it('rejects darkening 81 and a negative one', () => {
    expect(heroSectionValidations(withProps({ overlay: overlay({ darkening: 81 }) })).hasErrors('overlay.darkening')).toBe(true);
    expect(heroSectionValidations(withProps({ overlay: overlay({ darkening: -1 }) })).hasErrors('overlay.darkening')).toBe(true);
  });

  it('rejects an unusable text colour', () => {
    expect(heroSectionValidations(withProps({ overlay: overlay({ color: 'red; x' }) })).hasErrors('overlay.color')).toBe(true);
    expect(heroSectionValidations(withProps({ overlay: overlay({ color: '#fff' }) })).hasErrors('overlay.color')).toBe(false);
    expect(heroSectionValidations(withProps({ gradient: { from: '#009d53', to: '#014da2' } })).hasErrors('gradient.from')).toBe(false);
    expect(heroSectionValidations(withProps({ gradient: { from: 'green', to: '#014da2' } })).hasErrors('gradient.from')).toBe(true);
    expect(heroSectionValidations(withProps({ gradient: { from: '#fff', to: '#12345' } })).hasErrors('gradient.to')).toBe(true);
    expect(heroSectionValidations(withProps({})).hasErrors('gradient.from')).toBe(false);
  });

  it('accepts the named heights and a positive px height', () => {
    for (const height of ['S', 'M', 'L', 'full', 320]) {
      expect(heroSectionValidations(withProps({ height })).hasErrors('height')).toBe(false);
    }
  });

  it('rejects a zero, negative or unknown height', () => {
    for (const height of [0, -10, 'XL']) {
      expect(heroSectionValidations(withProps({ height })).hasErrors('height')).toBe(true);
    }
  });

  it('rejects an unknown focus', () => {
    expect(heroSectionValidations(withProps({ focus: 'left' })).hasErrors('focus')).toBe(true);
    expect(heroSectionValidations(withProps({ focus: 'top' })).hasErrors('focus')).toBe(false);
  });
});
