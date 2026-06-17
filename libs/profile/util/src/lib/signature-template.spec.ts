import '@angular/compiler'; // JIT fallback: the shared-util-core barrel transitively pulls @angular/common
import { describe, expect, it } from 'vitest';

import {
  composeOrgAddressLine,
  escapeSignatureHtml,
  formatSignaturePhone,
  normalizePhoneHref,
  renderSignature,
} from './signature-template';
import { SignatureModel } from './signature.model';

const MODEL: SignatureModel = {
  person: { displayName: 'Bruno Kaiser', functionLabel: 'Finanzen', phoneE164: '+41797908929' },
  org: {
    name: 'Seeclub Stäfa',
    addressLine: '8712 Stäfa, SWITZERLAND',
    websiteUrl: 'https://www.seeclub-staefa.ch',
    logoUrl: 'https://bkaiser.imgix.net/tenant/scs/logo/google-touch-icon.png?w=96&h=96&fit=clip&dpr=2',
  },
};

describe('escapeSignatureHtml', () => {
  it('escapes the HTML-significant characters', () => {
    expect(escapeSignatureHtml(`Tom & <Jerry> "x" 'y'`)).toBe('Tom &amp; &lt;Jerry&gt; &quot;x&quot; &#39;y&#39;');
  });
  it('leaves accents untouched', () => {
    expect(escapeSignatureHtml('Stäfa')).toBe('Stäfa');
  });
});

describe('formatSignaturePhone / normalizePhoneHref', () => {
  it('formats E.164 to the international display form', () => {
    expect(formatSignaturePhone('+41797908929')).toBe('+41 79 790 89 29');
  });
  it('returns the canonical E.164 for the tel href', () => {
    expect(normalizePhoneHref('+41 79 790 8929')).toBe('+41797908929');
  });
  it('falls back to the raw input when unparseable', () => {
    expect(formatSignaturePhone('not-a-number')).toBe('not-a-number');
  });
});

describe('composeOrgAddressLine', () => {
  it('composes zip + city + uppercased country', () => {
    const line = composeOrgAddressLine('8712', 'Stäfa', 'CH');
    expect(line.startsWith('8712 Stäfa, ')).toBe(true);
    const country = line.split(', ')[1];
    expect(country).toBe(country.toUpperCase());
    expect(country.length).toBeGreaterThan(0);
  });
  it('omits the country when no country code', () => {
    expect(composeOrgAddressLine('8712', 'Stäfa', '')).toBe('8712 Stäfa');
  });
  it('omits the place when only a country is known', () => {
    expect(composeOrgAddressLine('', '', 'CH').startsWith(',')).toBe(false);
  });
});

describe('renderSignature', () => {
  it('renders the display name', () => {
    expect(renderSignature(MODEL).html).toContain('Bruno Kaiser');
  });
  it('renders the function row when present and omits it when blank', () => {
    expect(renderSignature(MODEL).html).toContain('Finanzen');
    const noFn = renderSignature({ ...MODEL, person: { ...MODEL.person, functionLabel: '' } });
    expect(noFn.html).not.toContain('Finanzen');
  });
  it('renders the phone as a tel: link with the display form', () => {
    const html = renderSignature(MODEL).html;
    expect(html).toContain('href="tel:+41797908929"');
    expect(html).toContain('+41 79 790 89 29');
  });
  it('wraps the logo in an anchor only when a website url is present', () => {
    expect(renderSignature(MODEL).html).toContain('<a href="https://www.seeclub-staefa.ch"');
    const noWeb = renderSignature({ ...MODEL, org: { ...MODEL.org, websiteUrl: undefined } });
    expect(noWeb.html).toContain('<img src=');
    expect(noWeb.html).not.toContain('seeclub-staefa.ch');
  });
  it('escapes interpolated values', () => {
    const html = renderSignature({ ...MODEL, person: { ...MODEL.person, displayName: 'A & B' } }).html;
    expect(html).toContain('A &amp; B');
  });
  it('produces a plain-text fallback prefixed with the RFC 3676 delimiter', () => {
    const text = renderSignature(MODEL).text;
    expect(text.startsWith('-- \n')).toBe(true);
    expect(text).toContain('Seeclub Stäfa');
    expect(text).toContain('8712 Stäfa, SWITZERLAND');
  });
});
