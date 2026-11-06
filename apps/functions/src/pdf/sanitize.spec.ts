import { describe, expect, it } from 'vitest';

import { sanitizeEmailBody, sanitizeHtml } from './sanitize';

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
