import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { emailDomainOf, isSenderDomainAllowed, parseEmails } from './email-html.util';

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
