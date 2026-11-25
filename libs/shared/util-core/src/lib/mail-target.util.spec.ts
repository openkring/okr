import { describe, expect, it } from 'vitest';

import { mailTargetUrl } from './mail-target.util';

const ORIGIN = 'https://app.example.ch';

describe('mailTargetUrl', () => {
  it.each([
    ['https://a.ch/x', 'https://a.ch/x'],
    ['  https://a.ch/x?a=1&b=2#c  ', 'https://a.ch/x?a=1&b=2#c'],
    ['mailto:a@b.ch', 'mailto:a@b.ch'],
    ['tel:+41 44 000 00 00', 'tel:+41 44 000 00 00'],
  ])('keeps %s', (url, expected) => expect(mailTargetUrl(url, ORIGIN)).toBe(expected));

  it.each([
    ['/club', 'https://app.example.ch/club'],
    [' /private/events ', 'https://app.example.ch/private/events'],
    ['/', 'https://app.example.ch/'],
  ])('makes the app path %s absolute', (url, expected) => expect(mailTargetUrl(url, ORIGIN)).toBe(expected));

  it('does not double the slash of an origin that ends with one', () =>
    expect(mailTargetUrl('/club', 'https://app.example.ch/')).toBe('https://app.example.ch/club'));

  it.each([
    ['Https://a.ch/X', 'https://a.ch/X'],
    ['HTTPS://a.ch', 'https://a.ch'],
    ['MailTo:A@b.ch', 'mailto:A@b.ch'],
    ['TEL:+41', 'tel:+41'],
  ])('the scheme of %s may be written in capitals', (url, expected) => expect(mailTargetUrl(url, ORIGIN)).toBe(expected));

  it.each(['https://', 'https:///a', 'https://?x=1', 'https://#a', 'mailto:', 'mailto:?subject=x', 'mailto: ', 'tel:', 'tel:+', 'tel:?x'])(
    'refuses %j, a scheme without a target', (url) => expect(mailTargetUrl(url, ORIGIN)).toBe(''));

  it.each([
    '', '   ', '#top', '#', 'club.html', 'club.html#a', 'club', 'www.a.ch', '//evil.org', '/\\evil.org', '/a\\b', 'http://a.ch', 'HTTP://a.ch',
    'javascript:alert(1)', 'JavaScript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', 'ftp://a.ch',
    'https://a.ch/\u0001', 'https://a.ch/a\nb', 'https://a.ch\\@evil.org', '/club\u007f',
  ])('refuses %j', (url) => expect(mailTargetUrl(url, ORIGIN)).toBe(''));

  it.each([undefined, null, 42, {}, ['https://a.ch']])('refuses %j, which is no text', (url) => expect(mailTargetUrl(url, ORIGIN)).toBe(''));
});
