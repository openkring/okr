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
  const token = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const link = 'https://a.ch/auth?mode=resetPassword&oobCode=x$&y"z';
  const mail = (html: string, text = `Link: ${token}`, subject = 'Passwort') => ({ html, text, subject });
  const button = `<a href="${token}" target="_blank" style="color:#fff">Passwort setzen</a>`;

  it('puts the link into the href, attribute-escaped, and raw into the text', () => {
    expect(placeResetLink(mail(`<p>${button}</p>`), token, link)).toEqual({
      html: '<p><a href="https://a.ch/auth?mode=resetPassword&amp;oobCode=x$&amp;y&quot;z" target="_blank" style="color:#fff">Passwort setzen</a></p>',
      text: `Link: ${link}`,
    });
  });

  it('accepts several links and a replacement-pattern link literally', () => {
    const placed = placeResetLink(mail(`<A class="b" HREF="${token}">a</A> <a href = "${token}">b</a>`, `${token}\n${token}`), token, "https://a.ch/$'$`$&");
    expect(placed?.text).toBe("https://a.ch/$'$`$&\nhttps://a.ch/$'$`$&");
    expect(placed?.html.split('href').length).toBe(2);
    expect(placed?.html).toContain('<a href = "https://a.ch/$\'$`$&amp;">b</a>');
  });

  it('accepts the seeded document around the button: doctype, comments, style, title', () => {
    const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
      <html><head><!--[if gte mso 9]><xml></xml><![endif]--><!--[if !mso]><!--><meta content="IE=edge"><!--<![endif]-->
      <title>x</title><style type="text/css">p { margin:0; } a[x-apple-data-detectors=true] { color:inherit; }</style></head>
      <body><a href="https://a.ch" target="_blank"><img src="https://a.ch/l.png" alt="a > b"></a><p>${button}</p></body></html>`;
    expect(placeResetLink(mail(html), token, link)).toBeDefined();
  });

  it.each([
    ['no token at all', '<a href="https://a.ch">x</a>'],
    ['an image source', `<img src="${token}">`],
    ['a longer url', `<a href="https://evil/?l=${token}">x</a>`],
    ['a value that only starts with the token', `<a href="${token}x">x</a>`],
    ['another attribute', `<a data-x="${token}" href="https://a.ch">x</a>`],
    ['another attribute next to a good link', `<a data-x="${token}" href="${token}">x</a>`],
    ['an attribute name', `<a ${token}="1" href="${token}">x</a>`],
    ['a style block', `${button}<style>a { background: url(https://evil/${token}); }</style>`],
    ['a style block that looks like a link', `<style><a href="${token}">x</a></style>`],
    ['a title that looks like a link', `<title><a href="${token}">x</a></title>`],
    ['a textarea that looks like a link', `<textarea><a href="${token}">x</a></textarea>`],
    ['visible text', `${button}<p>${token}</p>`],
    ['only visible text', `<p>${token}</p>`],
    ['a comment', `${button}<!-- ${token} -->`],
    ['a comment that looks like a link', `<!-- <a href="${token}">x</a> -->`],
    ['an unclosed comment', `<!-- <a href="${token}">x</a>`],
    ['an unclosed style block', `<style> ${button}`],
    ['a single-quoted attribute that looks like a link', `<img alt='<a href="${token}">' src="https://a.ch/x.png">`],
    ['a double-quoted attribute around a broken quote', `<img alt="<a href='${token}'>">`],
    ['a tag the quote keeps open', `<img src="x<a href="${token}">`],
    ['an end tag', `</a href="${token}">`],
    ['a declaration', `<!x <a href="${token}">`],
    ['single quotes', `<a href='${token}'>x</a>`],
    ['no quotes', `<a href=${token}>x</a>`],
    ['an href on another tag', `<area href="${token}">`],
    ['a tag that only starts with a', `<abbr href="${token}">x</abbr>`],
    ['a second href', `<a href="https://a.ch" href="${token}">x</a>`],
    ['an unfinished tag', `<a href="${token}"`],
    ['a script', `${button}<script></script>`],
    ['a plaintext element', `<plaintext></plaintext>${button}`],
  ])('refuses the token in html: %s', (_, html) => {
    expect(placeResetLink(mail(html), token, link)).toBeUndefined();
  });

  it('refuses the token in the subject', () => {
    expect(placeResetLink(mail(button, token, `Link ${token}`), token, link)).toBeUndefined();
  });

  it('needs the token in the text half', () => {
    expect(placeResetLink(mail(button, 'no link'), token, link)).toBeUndefined();
  });
});

describe('layoutHasContent', () => {
  it('detects the content slot', () => {
    expect(layoutHasContent('<td>{{{ content }}}</td>')).toBe(true);
    expect(layoutHasContent('<td>{{content}}</td>')).toBe(false);
  });
});
