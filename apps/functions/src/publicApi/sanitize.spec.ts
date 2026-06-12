import { describe, it, expect } from 'vitest';
import { getHtmlSanitizer, sanitizeI18n } from './sanitize';

describe('getHtmlSanitizer', () => {
  it('strips <script> tags', async () => {
    const s = await getHtmlSanitizer();
    expect(s('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>');
  });

  it('strips <iframe>/<object>/<embed>', async () => {
    const s = await getHtmlSanitizer();
    expect(s('<iframe src="https://evil"></iframe>')).toBe('');
    expect(s('<object data="x"></object><embed>')).toBe('');
  });

  it('drops inline event handlers and style attributes', async () => {
    const s = await getHtmlSanitizer();
    const out = s('<img src="https://x/y.jpg" onerror="alert(1)" style="x">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('style');
    expect(out).toContain('src="https://x/y.jpg"');
  });

  it('removes javascript: and http: hrefs but keeps https/mailto', async () => {
    const s = await getHtmlSanitizer();
    expect(s('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
    expect(s('<a href="http://insecure">x</a>')).not.toContain('http://');
    expect(s('<a href="https://ok">x</a>')).toContain('href="https://ok"');
    expect(s('<a href="mailto:a@b.ch">x</a>')).toContain('mailto:a@b.ch');
  });

  it('keeps safe rich-text tags', async () => {
    const s = await getHtmlSanitizer();
    const html = '<h2>T</h2><p><strong>b</strong> <em>i</em></p><ul><li>x</li></ul><blockquote>q</blockquote>';
    expect(s(html)).toBe(html);
  });

  it('forces rel=noopener noreferrer on target=_blank links', async () => {
    const s = await getHtmlSanitizer();
    const out = s('<a href="https://ok" target="_blank">x</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('returns empty string for empty/undefined input', async () => {
    const s = await getHtmlSanitizer();
    expect(s('')).toBe('');
  });
});

describe('sanitizeI18n', () => {
  const fake = (html: string) => html.replace(/<script>.*?<\/script>/g, '');

  it('sanitizes every language value', () => {
    const out = sanitizeI18n({ de: '<p>a</p><script>x</script>', en: '<p>b</p>' }, fake);
    expect(out).toEqual({ de: '<p>a</p>', en: '<p>b</p>' });
  });

  it('passes undefined through unchanged', () => {
    expect(sanitizeI18n(undefined, fake)).toBeUndefined();
  });
});
