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

describe('sanitizeHtml (documents)', () => {
  it('still refuses http links', async () => {
    expect(await sanitizeHtml('<a href="http://a.ch">x</a>')).not.toContain('href=');
  });
});
