import { describe, expect, it } from 'vitest';

import { brandColorOf, DEFAULT_BRAND_COLOR, mailColorOf, textColorOn, tintOf } from './brand-color';

describe('brandColorOf', () => {
  it('keeps a valid hex colour, lowercased', () => expect(brandColorOf('#009D53')).toBe('#009d53'));
  it('expands the short form', () => expect(brandColorOf('#0af')).toBe('#00aaff'));
  it('falls back for empty, named or injected values', () => {
    expect(brandColorOf('')).toBe(DEFAULT_BRAND_COLOR);
    expect(brandColorOf(undefined)).toBe(DEFAULT_BRAND_COLOR);
    expect(brandColorOf('red')).toBe(DEFAULT_BRAND_COLOR);
    expect(brandColorOf('#fff;background:url(x)')).toBe(DEFAULT_BRAND_COLOR);
  });
});

describe('textColorOn', () => {
  it('puts white on a dark brand', () => {
    expect(textColorOn('#009D53')).toBe('#ffffff');
    expect(textColorOn('#002a7e')).toBe('#ffffff');
  });
  it('puts dark text on a light brand', () => {
    expect(textColorOn('#8ed698')).toBe('#1f2328');
    expect(textColorOn('#ffffff')).toBe('#1f2328');
  });
});

describe('tintOf', () => {
  it('mixes the colour with white', () => {
    expect(tintOf('#000000', 0.25)).toBe('#bfbfbf');
    expect(tintOf('#009d53', 1)).toBe('#009d53');
    expect(tintOf('#009d53', 0)).toBe('#ffffff');
  });
});

describe('mailColorOf', () => {
  it('keeps a #rrggbb colour, lowercased', () => expect(mailColorOf('#014DA2')).toBe('#014da2'));
  it('falls back to dark grey for anything unsafe', () => {
    expect(mailColorOf('red;x')).toBe('#222222');
    expect(mailColorOf('#0af')).toBe('#222222');
    expect(mailColorOf(undefined)).toBe('#222222');
    expect(mailColorOf(42)).toBe('#222222');
  });
});
