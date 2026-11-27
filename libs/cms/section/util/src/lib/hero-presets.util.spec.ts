import { describe, expect, it } from 'vitest';
import { HERO_SECTION_SHAPE, HeroConfig, IMAGE_CONFIG_SHAPE } from '@okr/shared-models';

import {
  addHeroCta, applyHeroCover, applyHeroHeight, applyHeroLogoShape, applyHeroLogoSize, HERO_DEFAULT_HEIGHT_PX, heroHasCover, heroHeightChoiceOf,
  heroLogoShapeOf, heroLogoSizeOf, moveHeroCtaForward, removeHeroCta, updateHeroCta,
} from './hero-presets.util';

const config = (over: Partial<HeroConfig> = {}): HeroConfig => ({ ...HERO_SECTION_SHAPE.properties, ...over });

describe('cover', () => {
  it('has a cover only with a url', () => {
    expect(heroHasCover(config())).toBe(false);
    expect(heroHasCover(config({ hero: { ...IMAGE_CONFIG_SHAPE, url: 'a.jpg' } }))).toBe(true);
  });
  it('removing leaves an empty image', () => {
    const next = applyHeroCover(config({ hero: { ...IMAGE_CONFIG_SHAPE, url: 'a.jpg' } }), undefined);
    expect(next.hero).toEqual(IMAGE_CONFIG_SHAPE);
  });
});

describe('height', () => {
  it('reads the stored height as a choice', () => {
    expect(heroHeightChoiceOf(undefined)).toBe('default');
    expect(heroHeightChoiceOf('L')).toBe('L');
    expect(heroHeightChoiceOf(420)).toBe('px');
  });
  it('default removes the field', () => {
    expect('height' in applyHeroHeight(config({ height: 'M' }), 'default')).toBe(false);
  });
  it('a named height is stored as it is', () => expect(applyHeroHeight(config(), 'full').height).toBe('full'));
  it('px keeps a stored number, else starts from the default', () => {
    expect(applyHeroHeight(config({ height: 333 }), 'px').height).toBe(333);
    expect(applyHeroHeight(config({ height: 'S' }), 'px').height).toBe(HERO_DEFAULT_HEIGHT_PX);
  });
});

describe('logo', () => {
  it('a size writes the width of the image style', () => {
    const next = applyHeroLogoSize(config(), 'l');
    expect(next.imageStyle.width).toBe('240px');
    expect(heroLogoSizeOf(next)).toBe('l');
  });
  it('a width of its own is no size', () => {
    expect(heroLogoSizeOf(config({ imageStyle: { ...config().imageStyle, width: '123px' } }))).toBeUndefined();
  });
  it('a shape writes the corner radius', () => {
    const next = applyHeroLogoShape(config(), 'round');
    expect(next.imageStyle.borderRadius).toBe('50%');
    expect(heroLogoShapeOf(next)).toBe('round');
    expect(heroLogoShapeOf(config())).toBeUndefined();   // the stored default 4px
  });
  it('keeps the other style fields', () => {
    const next = applyHeroLogoSize(config({ imageStyle: { ...config().imageStyle, imgIxParams: 'sat=-30' } }), 's');
    expect(next.imageStyle.imgIxParams).toBe('sat=-30');
  });
});

describe('buttons', () => {
  it('adds a primary, then a secondary, then no more', () => {
    const one = addHeroCta(config());
    const two = addHeroCta(one);
    expect(one.ctas).toEqual([{ label: '', url: '', style: 'primary' }]);
    expect(two.ctas?.[1].style).toBe('secondary');
    expect(addHeroCta(two)).toBe(two);
  });
  it('updates one button', () => {
    const next = updateHeroCta(addHeroCta(config()), 0, { label: 'Los' });
    expect(next.ctas?.[0].label).toBe('Los');
  });
  it('removing the last leaves no ctas field', () => {
    expect('ctas' in removeHeroCta(addHeroCta(config()), 0)).toBe(false);
  });
  it('moves a button to the front', () => {
    const two = updateHeroCta(addHeroCta(addHeroCta(config())), 1, { label: 'B' });
    expect(moveHeroCtaForward(two, 1).ctas?.[0].label).toBe('B');
    expect(moveHeroCtaForward(two, 0)).toBe(two);
  });
});
