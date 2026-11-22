import { describe, expect, it } from 'vitest';

import {
  mailingWebFunctionUrl, newWebToken, WEB_VERSION_CSP, webTokenFromRequest, webVersionOn, webVersionUrl, withWebLink,
} from './web-version.logic';

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

const FN = 'https://europe-west6-p.cloudfunctions.net/mailingWeb';
const TOKEN = 'AbCdEfGhIjKlMnOpQr_-12';

describe('mailingWebFunctionUrl', () => {
  it('is the function\'s own URL', () => expect(mailingWebFunctionUrl('p')).toBe(FN));
});

describe('webVersionUrl', () => {
  it('is <function url>?t=<token>', () => expect(webVersionUrl(FN, TOKEN)).toBe(`${FN}?t=${TOKEN}`));
  it('round-trips through webTokenFromRequest', () => {
    const url = new URL(webVersionUrl(mailingWebFunctionUrl('p'), newWebToken()));
    expect(webTokenFromRequest('/', { t: url.searchParams.get('t') })).toBe(url.searchParams.get('t'));
  });
});

describe('webTokenFromRequest', () => {
  it('accepts exactly 22 base64url characters at the root', () => expect(webTokenFromRequest('/', { t: TOKEN })).toBe(TOKEN));
  it('accepts an empty path', () => expect(webTokenFromRequest('', { t: TOKEN })).toBe(TOKEN));
  it('refuses a short token', () => expect(webTokenFromRequest('/', { t: 'short' })).toBeUndefined());
  it('refuses a long token', () => expect(webTokenFromRequest('/', { t: TOKEN + 'x' })).toBeUndefined());
  it('refuses ..', () => expect(webTokenFromRequest('/', { t: '../' + TOKEN.slice(3) })).toBeUndefined());
  it('refuses a slash in the token', () => expect(webTokenFromRequest('/', { t: TOKEN.slice(0, 21) + '/' })).toBeUndefined());
  it('refuses an extra path segment', () => expect(webTokenFromRequest('/x', { t: TOKEN })).toBeUndefined());
  it('refuses the token as a path segment', () => expect(webTokenFromRequest('/' + TOKEN, {})).toBeUndefined());
  it('refuses a wrong parameter name', () => expect(webTokenFromRequest('/', { m: TOKEN })).toBeUndefined());
  it('refuses a repeated parameter', () => expect(webTokenFromRequest('/', { t: [TOKEN, TOKEN] })).toBeUndefined());
  it('refuses a missing parameter', () => expect(webTokenFromRequest('/', {})).toBeUndefined());
});

describe('WEB_VERSION_CSP', () => {
  it('runs no script and posts no form', () => {
    expect(WEB_VERSION_CSP).toContain("default-src 'none'");
    expect(WEB_VERSION_CSP).not.toContain('script-src');
    expect(WEB_VERSION_CSP).toContain("form-action 'none'");
    expect(WEB_VERSION_CSP).toContain("frame-ancestors 'none'");
    expect(WEB_VERSION_CSP).toContain("base-uri 'none'");
  });
  it('shows https images (the mail allows any https image)', () => expect(WEB_VERSION_CSP).toContain('img-src https: data:'));
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
