import { describe, expect, it } from 'vitest';

import { resolvePeopleLook } from './people-look';

describe('resolvePeopleLook', () => {
  it('defaults', () => {
    expect(resolvePeopleLook(undefined)).toEqual({ size: 'S', shape: 'round', fill: 'original', grayscale: false, textPosition: 'below' });
  });
  it('maps stored old values', () => {
    expect(resolvePeopleLook({ imgWidth: 300, imgRadius: '5px', background: 'orgColor', bgOrgColor: 'primary', infoPosition: 'overlayBottom' }))
      .toEqual({ size: 'L', shape: 'rounded', fill: 'primary', grayscale: false, textPosition: 'overlay' });
    expect(resolvePeopleLook({ imgWidth: 120, imgRadius: '50%', background: 'original', infoPosition: 'right' }))
      .toEqual({ size: 'S', shape: 'round', fill: 'original', grayscale: false, textPosition: 'right' });
  });
  it('maps radius', () => {
    expect(resolvePeopleLook({ imgRadius: '4px' }).shape).toBe('rounded');
    expect(resolvePeopleLook({ imgRadius: '0px' }).shape).toBe('square');
    expect(resolvePeopleLook({ imgRadius: '0' }).shape).toBe('square');
  });
  it('maps width at the boundaries', () => {
    expect(resolvePeopleLook({ imgWidth: 160 }).size).toBe('S');
    expect(resolvePeopleLook({ imgWidth: 161 }).size).toBe('M');
    expect(resolvePeopleLook({ imgWidth: 250 }).size).toBe('M');
    expect(resolvePeopleLook({ imgWidth: 251 }).size).toBe('L');
  });
  it('maps fill and text position', () => {
    expect(resolvePeopleLook({ background: 'removed' }).fill).toBe('original');
    expect(resolvePeopleLook({ background: 'colors' }).fill).toBe('original');
    expect(resolvePeopleLook({ background: 'orgColor', bgOrgColor: 'secondary' }).fill).toBe('primary');
    expect(resolvePeopleLook({ background: 'orgColor', bgOrgColor: 'alternating' }).fill).toBe('alternating');
    expect(resolvePeopleLook({ infoPosition: 'above' }).textPosition).toBe('below');
    expect(resolvePeopleLook({ infoPosition: 'left' }).textPosition).toBe('right');
    expect(resolvePeopleLook({ infoPosition: 'overlayTop' }).textPosition).toBe('overlay');
  });
  it('a stored new field wins; an unknown one falls back', () => {
    expect(resolvePeopleLook({ size: 'M', imgWidth: 300 }).size).toBe('M');
    expect(resolvePeopleLook({ size: 'XL' as never, imgWidth: 300 }).size).toBe('L');
  });
  it('keeps grayscale', () => {
    expect(resolvePeopleLook({ grayscale: true }).grayscale).toBe(true);
  });
});
