import { describe, expect, it } from 'vitest';

import { sanitizeEmailBody, sanitizeHtml, sanitizeResetMail } from './sanitize';

describe('sanitizeEmailBody', () => {
  it('keeps http links and images, drops scripts and handlers', async () => {
    const out = await sanitizeEmailBody('<a href="http://a.ch">x</a><img src="https://a.ch/a.png" onerror="y()"><script>z()</script>');
    expect(out).toContain('href="http://a.ch"');
    expect(out).toContain('<img');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('<script');
  });

  it('keeps tel and mailto links and drops javascript links', async () => {
    const out = await sanitizeEmailBody('<a href="tel:+41441234567">t</a><a href="mailto:a@b.ch">m</a><a href="javascript:alert(1)">j</a>');
    expect(out).toContain('href="tel:+41441234567"');
    expect(out).toContain('href="mailto:a@b.ch"');
    expect(out).not.toContain('javascript:');
  });

  it('keeps inline styles', async () => {
    expect(await sanitizeEmailBody('<p style="color:red">x</p>')).toContain('style="color:red"');
  });
});

describe('sanitizeEmailBody policy', () => {
  it('removes a <style> block and the document tags, with the style text', async () => {
    const out = await sanitizeEmailBody('<html><head><style>p{display:none}</style></head><body><p>x</p></body></html>');
    expect(out).not.toContain('<style');
    expect(out).not.toContain('display:none');
    expect(out).not.toMatch(/<(html|head|body)/);
    expect(out).toContain('<p>x</p>');
  });

  it('removes a data: link but keeps a data: image', async () => {
    const out = await sanitizeEmailBody('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a><img src="data:image/png;base64,AAAA">');
    expect(out).not.toContain('href=');
    expect(out).toContain('src="data:image/png;base64,AAAA"');
  });

  it('keeps an inline-styled paragraph', async () => {
    expect(await sanitizeEmailBody('<p style="color:red;font-size:14px">x</p>')).toBe('<p style="color:red;font-size:14px">x</p>');
  });

  it('drops an http image', async () => {
    expect(await sanitizeEmailBody('<img src="http://a.ch/a.png">')).not.toContain('src=');
  });
});

describe('sanitizeHtml (documents)', () => {
  it('still refuses http links', async () => {
    expect(await sanitizeHtml('<a href="http://a.ch">x</a>')).not.toContain('href=');
  });
});

describe('sanitizeResetMail', () => {
  it('keeps the shape of the seeded mail', async () => {
    const html = await sanitizeResetMail(
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff;"><tr>'
      + '<td align="center" style="padding:24px;"><a href="https://a.ch" target="_blank"><img src="https://a.ch/l.png" alt="Logo" width="209" style="display:block;"></a></td></tr></table>'
    );
    expect(html).toContain('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff">');
    expect(html).toContain('<td align="center" style="padding:24px">');
    expect(html).toContain('<a href="https://a.ch" target="_blank">');
    expect(html).toContain('<img src="https://a.ch/l.png" alt="Logo" width="209" style="display:block" />');
  });

  it('keeps a token without a scheme as href', async () => {
    expect(await sanitizeResetMail('<a href="okr-reset-1234">x</a>')).toBe('<a href="okr-reset-1234">x</a>');
  });

  it('drops the document around the content, the title with its text', async () => {
    const html = await sanitizeResetMail('<!DOCTYPE html><html><head><title>Titel</title><meta charset="utf-8"></head><body><p>x</p></body></html>');
    expect(html).toBe('<p style="margin:0">x</p>');
  });

  it('gives a paragraph a margin of 0 and keeps its style', async () => {
    expect(await sanitizeResetMail('<p style="color:red">x</p>')).toBe('<p style="margin:0;color:red">x</p>');
    expect(await sanitizeResetMail('<p>&nbsp;</p>')).toContain('<p style="margin:0">');
  });

  it('drops style blocks, comments, conditional comments and active content', async () => {
    const html = await sanitizeResetMail('<style>a{color:red}</style><!-- c --><!--[if mso]><b>m</b><![endif]--><script>x()</script><noscript>n</noscript><svg></svg><math></math><base href="https://evil/"><form action="https://evil/"><textarea>t</textarea></form><p>ok</p>');
    expect(html).toBe('<p style="margin:0">ok</p>');
  });

  it('drops class, id, name, data, event and ping attributes', async () => {
    const html = await sanitizeResetMail('<a href="https://a.ch" class="c" id="i" name="n" data-x="1" onclick="x()" ping="https://evil/">x</a>');
    expect(html).toBe('<a href="https://a.ch">x</a>');
  });

  it('allows only https and mailto links and https images, nothing protocol-relative', async () => {
    expect(await sanitizeResetMail('<a href="mailto:a@b.ch">x</a>')).toContain('href="mailto:a@b.ch"');
    for (const href of ['http://a.ch', 'javascript:x()', 'data:text/html,x', 'tel:+41', '//evil/x']) {
      expect(await sanitizeResetMail(`<a href="${href}">x</a>`)).toBe('<a>x</a>');
    }
    for (const src of ['http://a.ch/x.png', 'data:image/png;base64,AA', '//evil/x.png']) {
      expect(await sanitizeResetMail(`<img src="${src}">`)).not.toContain('src=');
    }
  });
});
