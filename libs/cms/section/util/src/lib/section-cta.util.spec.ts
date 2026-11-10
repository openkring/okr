import { describe, expect, it } from 'vitest';

import { SectionCta } from '@okr/shared-models';
import { isSectionCtaUrl, validCtas } from './section-cta.util';

describe('isSectionCtaUrl', () => {
  it.each(['bootshaus.html', 'seite.html?key=scsw_kurs_erwachsene', '#kurse', 'https://seeclub.org', 'mailto:a@b.ch', 'tel:+41441234567', '/pfad/seite'])('accepts %s', (u) => {
    expect(isSectionCtaUrl(u)).toBe(true);
  });

  it.each(['javascript:alert(1)', '//evil.com', 'http://x.ch', '../x.html', '', 'foo', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', 'https://ok.ch\\@evil.com'])('rejects %s', (u) => {
    expect(isSectionCtaUrl(u)).toBe(false);
  });
});

describe('validCtas', () => {
  const cta = (over: Partial<SectionCta> = {}): SectionCta => ({ label: 'Los', url: '#a', style: 'primary', ...over });

  it('drops entries without label or safe url and caps at max', () => {
    const result = validCtas([cta({ label: ' ' }), cta({ url: 'javascript:x' }), cta(), cta({ label: 'B' }), cta({ label: 'C' })], 2);
    expect(result.map((c) => c.label)).toEqual(['Los', 'B']);
  });

  it('handles undefined', () => {
    expect(validCtas(undefined, 2)).toEqual([]);
  });
});
