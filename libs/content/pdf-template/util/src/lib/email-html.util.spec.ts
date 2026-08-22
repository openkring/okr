import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { buildBrandedEmailHtml, emailDomainOf, isSenderDomainAllowed, parseEmails } from './email-html.util';

describe('parseEmails', () => {
  it('splits on comma and trims', () => {
    expect(parseEmails('a@x.ch, b@x.ch ,c@x.ch')).toEqual(['a@x.ch', 'b@x.ch', 'c@x.ch']);
  });

  it('drops empty entries', () => {
    expect(parseEmails('a@x.ch,, ,b@x.ch')).toEqual(['a@x.ch', 'b@x.ch']);
  });

  it('returns empty array for empty/whitespace input', () => {
    expect(parseEmails('')).toEqual([]);
    expect(parseEmails('   ')).toEqual([]);
  });
});

describe('buildBrandedEmailHtml', () => {
  const base = { orgName: 'Seeclub Stäfa', contactEmail: 'info@seeclub.org' };

  it('produces a full HTML document', () => {
    const html = buildBrandedEmailHtml('<p>Hallo</p>', base);
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('</html>');
  });

  it('includes the org name in the header', () => {
    expect(buildBrandedEmailHtml('<p>x</p>', base)).toContain('Seeclub Stäfa');
  });

  it('passes the body html through verbatim', () => {
    expect(buildBrandedEmailHtml('<p>Guten Tag Herr Müller</p>', base)).toContain('<p>Guten Tag Herr Müller</p>');
  });

  it('renders an <img> when an absolute logoUrl is given', () => {
    const html = buildBrandedEmailHtml('<p>x</p>', { ...base, logoUrl: 'https://bkaiser.imgix.net/logo.png' });
    expect(html).toContain('<img');
    expect(html).toContain('https://bkaiser.imgix.net/logo.png');
  });

  it('renders no <img> when logoUrl is missing', () => {
    expect(buildBrandedEmailHtml('<p>x</p>', base)).not.toContain('<img');
  });

  it('renders the attachment line only when attachmentFilename is given', () => {
    expect(buildBrandedEmailHtml('<p>x</p>', { ...base, attachmentFilename: 'rechnung.pdf' })).toContain('rechnung.pdf');
    expect(buildBrandedEmailHtml('<p>x</p>', base)).not.toContain('Beilage');
  });

  it('renders the contact email as a mailto link in the footer', () => {
    const html = buildBrandedEmailHtml('<p>x</p>', base);
    expect(html).toContain('mailto:info@seeclub.org');
  });

  it('omits the footer contact when no contactEmail is given', () => {
    const html = buildBrandedEmailHtml('<p>x</p>', { orgName: 'Org' });
    expect(html).not.toContain('mailto:');
  });

  it('escapes HTML in orgName to avoid breaking markup', () => {
    const html = buildBrandedEmailHtml('<p>x</p>', { orgName: 'A & B <Co>' });
    expect(html).toContain('A &amp; B &lt;Co&gt;');
    expect(html).not.toContain('A & B <Co>');
  });
});

describe('isSenderDomainAllowed', () => {
  it('accepts the configured domain itself', () => {
    expect(isSenderDomainAllowed('app@seeclub.org', 'seeclub.org')).toBe(true);
  });
  it('accepts the apex when the app is hosted on a subdomain', () => {
    expect(isSenderDomainAllowed('kommunikation@seeclub.org', 'app.seeclub.org')).toBe(true);
  });
  it('accepts a subdomain of the configured domain', () => {
    expect(isSenderDomainAllowed('app@mail.seeclub.org', 'seeclub.org')).toBe(true);
  });
  it('is case-insensitive and ignores surrounding blanks', () => {
    expect(isSenderDomainAllowed('  Info@SeeClub.ORG ', 'app.seeclub.org')).toBe(true);
  });
  it('rejects a foreign domain', () => {
    expect(isSenderDomainAllowed('info@example.com', 'seeclub.org')).toBe(false);
  });
  it('rejects a domain that merely ends with the same letters', () => {
    expect(isSenderDomainAllowed('info@notseeclub.org', 'seeclub.org')).toBe(false);
  });
  it('rejects when either side is missing', () => {
    expect(isSenderDomainAllowed('info', 'seeclub.org')).toBe(false);
    expect(isSenderDomainAllowed('info@seeclub.org', '')).toBe(false);
  });
});

describe('emailDomainOf', () => {
  it('returns the lower-cased domain', () => {
    expect(emailDomainOf(' Info@SeeClub.org ')).toBe('seeclub.org');
  });
  it('returns empty without an @', () => {
    expect(emailDomainOf('nobody')).toBe('');
  });
});
