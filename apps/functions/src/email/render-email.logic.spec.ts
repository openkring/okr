import { describe, expect, it } from 'vitest';

import { isUsableEmailTemplate, layoutHasContent, placeResetLink } from './render-email.logic';

describe('isUsableEmailTemplate', () => {
  const ok = { kind: 'emailText', tenants: ['system'], currentVersion: 1 } as const;

  it('rejects archived, draft-only and foreign templates', () => {
    expect(isUsableEmailTemplate(ok, 'system', 'emailText')).toBe(true);
    expect(isUsableEmailTemplate({ ...ok, currentVersion: 0 }, 'system', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, isArchived: true }, 'system', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, tenants: ['p13'] }, 'system', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, kind: 'emailLayout' }, 'system', 'emailText')).toBe(false);
  });

  it('wants the expected owner as the only entry of tenants', () => {
    expect(isUsableEmailTemplate({ ...ok, tenants: ['scs'] }, 'scs', 'emailText')).toBe(true);
    expect(isUsableEmailTemplate({ ...ok, tenants: ['p13', 'scs'] }, 'scs', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, tenants: ['scs', 'scs'] }, 'scs', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, tenants: ['p13', 'system'] }, 'system', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, tenants: ['system'] }, 'scs', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate({ ...ok, tenants: undefined }, 'scs', 'emailText')).toBe(false);
  });

  it('reads a legacy doc without kind as pdf', () => {
    expect(isUsableEmailTemplate({ tenants: ['scs'], currentVersion: 1 }, 'scs', 'pdf')).toBe(true);
    expect(isUsableEmailTemplate({ tenants: ['scs'], currentVersion: 1 }, 'scs', 'emailText')).toBe(false);
    expect(isUsableEmailTemplate(undefined, 'scs', 'emailText')).toBe(false);
  });
});

describe('placeResetLink', () => {
  const token = 'okr-reset-0f8fad5b-d9cb-469f-a165-70867728950e';
  const link = 'https://a.ch/auth?mode=resetPassword&oobCode=x$&y"z';
  const mail = (html: string, text = `Link: ${token}`, subject = 'Passwort') => ({ html, text, subject });
  const button = `<a href="${token}" target="_blank" style="color:#fff">Passwort setzen</a>`;

  it('puts the link into the href, attribute-escaped, and raw into the text, inside the fixed shell', () => {
    expect(placeResetLink(mail(`<p>${button}</p>`), token, link)).toEqual({
      html: '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'
        + '<body style="margin:0;padding:0;background-color:#fff;">'
        + '<p><a href="https://a.ch/auth?mode=resetPassword&amp;oobCode=x$&amp;y&quot;z" target="_blank" style="color:#fff">Passwort setzen</a></p>'
        + '</body></html>',
      text: `Link: ${link}`,
    });
  });

  it('accepts several links, with href anywhere in the tag, and takes a replacement pattern literally', () => {
    const pattern = "https://a.ch/$'$`$&";
    const placed = placeResetLink(mail(`<a target="_blank" href="${token}">a</a> <a href="${token}">b</a>`, `${token}\n${token}`), token, pattern);
    expect(placed?.text).toBe(`${pattern}\n${pattern}`);
    expect(placed?.html).toContain(`<a target="_blank" href="https://a.ch/$'$\`$&amp;">a</a>`);
  });

  it.each([
    ['no token at all', '<a href="https://a.ch">x</a>'],
    ['an image source', `<img src="${token}">`],
    ['a longer url', `<a href="https://evil/?l=${token}">x</a>`],
    ['a value that only starts with the token', `<a href="${token}x">x</a>`],
    ['another attribute', `<a title="${token}" href="https://a.ch">x</a>`],
    ['another attribute next to a good link', `<a title="${token}" href="${token}">x</a>`],
    ['visible text', `${button}<p>${token}</p>`],
    ['only visible text', `<p>${token}</p>`],
    ['an href on another tag', `<abbr href="${token}">x</abbr>`],
    ['escaped quotes in an attribute', `<a title=" href=&quot;${token}&quot;" href="https://a.ch">x</a>`],
  ])('refuses the token in html: %s', (_, html) => {
    expect(placeResetLink(mail(html), token, link)).toBeUndefined();
  });

  it('refuses the token in the subject', () => {
    expect(placeResetLink(mail(button, token, `Link ${token}`), token, link)).toBeUndefined();
  });

  it.each([
    ['alone', token],
    ['on its own line', `Klicke hier:\n\n${token}\n\nGruss`],
    ['after a label and a space', `Link: ${token}`],
    ['several times', `${token}\n${token}`],
  ])('accepts a token that stands alone in the text: %s', (_, text) => {
    expect(placeResetLink(mail(button, text), token, link)).toBeDefined();
  });

  it.each([
    ['missing', 'no link'],
    ['inside a longer url', `https://evil/?l=${token}`],
    ['with text behind it', `${token}&x=1`],
    ['one good, one inside a url', `${token}\nhttps://evil/?l=${token}`],
    ['twice in a row', `${token}${token}`],
  ])('refuses a token in the text: %s', (_, text) => {
    expect(placeResetLink(mail(button, text), token, link)).toBeUndefined();
  });
});

describe('layoutHasContent', () => {
  it('detects the content slot', () => {
    expect(layoutHasContent('<td>{{{ content }}}</td>')).toBe(true);
    expect(layoutHasContent('<td>{{content}}</td>')).toBe(false);
  });
});
