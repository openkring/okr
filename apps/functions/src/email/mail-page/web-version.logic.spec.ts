import { describe, expect, it } from 'vitest';

import { newWebToken, webVersionOn, webVersionUrl, withWebLink } from './web-version.logic';

describe('webVersionOn', () => {
  it('defaults to on for a newsletter', () => expect(webVersionOn(undefined, true)).toBe(true));
  it('defaults to off otherwise', () => expect(webVersionOn(undefined, false)).toBe(false));
  it('follows an explicit off on a newsletter', () => expect(webVersionOn(false, true)).toBe(false));
  it('follows an explicit on elsewhere', () => expect(webVersionOn(true, false)).toBe(true));
});

describe('newWebToken', () => {
  it('is 22 base64url characters', () => expect(newWebToken()).toMatch(/^[A-Za-z0-9_-]{22}$/));
  it('differs on every call', () => expect(newWebToken()).not.toBe(newWebToken()));
});

describe('webVersionUrl', () => {
  it('is <origin>/m/<token>', () => expect(webVersionUrl('https://app.seeclub.org', 'abc')).toBe('https://app.seeclub.org/m/abc'));
});

describe('withWebLink', () => {
  it('puts the link before the body', () => {
    const html = withWebLink('<p>Hallo</p>', 'https://app.x.org/m/t', 'Im Browser ansehen');
    expect(html.indexOf('href="https://app.x.org/m/t"')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('Im Browser ansehen')).toBeLessThan(html.indexOf('<p>Hallo</p>'));
    expect(html.endsWith('<p>Hallo</p>')).toBe(true);
  });

  it('escapes " in the url and markup in the label', () => {
    const html = withWebLink('', 'https://x.org/m/a"onmouseover="x', '<b>');
    expect(html).not.toContain('a"onmouseover');
    expect(html).toContain('a&quot;onmouseover=&quot;x');
    expect(html).toContain('&lt;b&gt;');
  });
});
