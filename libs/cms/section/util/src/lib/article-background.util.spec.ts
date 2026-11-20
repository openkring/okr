import { describe, expect, it } from 'vitest';

import { articleBackground, articleHasLightText } from './article-background.util';

describe('articleBackground', () => {
  it('passes a checked hex value through, trimmed', () => {
    expect(articleBackground({ background: ' #59A4BF ' })).toBe('#59A4BF');
    expect(articleBackground({ background: '#fff' })).toBe('#fff');
  });

  it('returns empty for absent, empty or unsafe values', () => {
    expect(articleBackground(undefined)).toBe('');
    expect(articleBackground({})).toBe('');
    expect(articleBackground({ background: '' })).toBe('');
    expect(articleBackground({ background: 'red;color:red' })).toBe('');
    expect(articleBackground({ background: '#12345' })).toBe('');
  });
});

describe('articleHasLightText', () => {
  it('is false without a background, whatever the text colour', () => {
    expect(articleHasLightText(undefined)).toBe(false);
    expect(articleHasLightText({ textColor: 'light' })).toBe(false);
  });

  it('follows the brightness of the background when no text colour is set', () => {
    expect(articleHasLightText({ background: '#3c163c' })).toBe(true);
    expect(articleHasLightText({ background: '#59A4BF' })).toBe(false);
    expect(articleHasLightText({ background: '#3c163c', textColor: 'auto' })).toBe(true);
  });

  it('lets an explicit text colour win', () => {
    expect(articleHasLightText({ background: '#59A4BF', textColor: 'light' })).toBe(true);
    expect(articleHasLightText({ background: '#3c163c', textColor: 'dark' })).toBe(false);
  });
});
