import { describe, expect, it } from 'vitest';
import { HERO_OVERLAY_DEFAULT, HERO_SECTION_SHAPE, HeroConfig } from '@okr/shared-models';

import { heroHeightCss, heroImgixParams, heroObjectPosition, heroOverlayCss } from './hero.util';

const config = (over: Partial<HeroConfig> = {}): HeroConfig => ({ ...HERO_SECTION_SHAPE.properties, ...over });

describe('heroHeightCss', () => {
  it('keeps today\'s height when unset', () => expect(heroHeightCss(undefined)).toBe('min(700px, 60vh)'));
  it.each([['S', '35vh'], ['M', '50vh'], ['L', '70vh'], ['full', '100vh']] as const)('%s', (h, css) => {
    expect(heroHeightCss(h)).toBe(css);
  });
  it('turns a number into px', () => expect(heroHeightCss(420)).toBe('420px'));
  it('falls back for an unusable number', () => {
    expect(heroHeightCss(0)).toBe('min(700px, 60vh)');
    expect(heroHeightCss(-5)).toBe('min(700px, 60vh)');
  });
});

describe('heroImgixParams', () => {
  it('is empty without a focus', () => expect(heroImgixParams(config())).toBe(''));
  it('crops around the focal point for center', () => expect(heroImgixParams(config({ focus: 'center' }))).toBe('fit=crop&crop=focalpoint'));
  it('crops to the top', () => expect(heroImgixParams(config({ focus: 'top' }))).toBe('fit=crop&crop=top'));
  it('crops to the bottom', () => expect(heroImgixParams(config({ focus: 'bottom' }))).toBe('fit=crop&crop=bottom'));
});

describe('heroObjectPosition', () => {
  it('maps the focus for the offline crop', () => {
    expect(heroObjectPosition(undefined)).toBe('center');
    expect(heroObjectPosition('center')).toBe('center');
    expect(heroObjectPosition('top')).toBe('center top');
    expect(heroObjectPosition('bottom')).toBe('center bottom');
  });
});

describe('heroOverlayCss', () => {
  it('draws no gradient at darkening 0', () => {
    expect(heroOverlayCss({ ...HERO_OVERLAY_DEFAULT, darkening: 0 })['background']).toBe('none');
  });
  it('uses darkening / 100 as the gradient alpha', () => {
    expect(heroOverlayCss({ ...HERO_OVERLAY_DEFAULT, darkening: 80 })['background']).toContain('rgba(0, 0, 0, 0.8)');
    expect(heroOverlayCss({ ...HERO_OVERLAY_DEFAULT, darkening: 40 })['background']).toContain('rgba(0, 0, 0, 0.4)');
  });
  it('clamps darkening above 80', () => {
    expect(heroOverlayCss({ ...HERO_OVERLAY_DEFAULT, darkening: 100 })['background']).toContain('0.8)');
  });
  it('places the text by position', () => {
    expect(heroOverlayCss({ ...HERO_OVERLAY_DEFAULT, position: 'bottom-left' })).toMatchObject({ 'justify-content': 'flex-end', 'align-items': 'flex-start', 'text-align': 'left' });
    expect(heroOverlayCss({ ...HERO_OVERLAY_DEFAULT, position: 'bottom-center' })).toMatchObject({ 'justify-content': 'flex-end', 'align-items': 'center' });
    expect(heroOverlayCss({ ...HERO_OVERLAY_DEFAULT, position: 'center' })).toMatchObject({ 'justify-content': 'center', 'align-items': 'center' });
    expect(heroOverlayCss({ ...HERO_OVERLAY_DEFAULT, position: 'top-left' })).toMatchObject({ 'justify-content': 'flex-start', 'align-items': 'flex-start' });
  });
  it('carries colour and font size', () => {
    expect(heroOverlayCss({ ...HERO_OVERLAY_DEFAULT, color: '#ff0000', fontSize: 'L' })).toMatchObject({ color: '#ff0000', 'font-size': '2.8rem' });
  });
});
