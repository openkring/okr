import { describe, expect, it } from 'vitest';

import { buildVCard } from './vcard-generator';
import { bookCtag, buildLookupVCard, cardEtag, LOOKUP_SCOPE, withPhoto } from './vcard-lookup';
import { VcardRecord } from './vcard-types';

const lines = (vcf: string): string[] => vcf.split('\r\n');

const FULL: VcardRecord = {
  kind: 'person',
  uid: 'person-abc123',
  nickname: 'Spiky',
  firstName: 'Kring',
  lastName: 'Spike',
  displayName: 'Kring Spike',
  bday: '1980-04-15',
  channels: [
    { channel: 'phone', type: 'CELL', pref: true, value: '+41 79 123 45 67' },
    { channel: 'email', pref: false, value: 'spike@example.invalid' },
    { channel: 'postal', pref: false, street: 'Seestrasse 1', city: 'Zürich', zip: '8000', country: 'Switzerland' },
    { channel: 'web', pref: false, value: 'https://example.invalid' },
  ],
  employment: { org: 'Acme AG', title: 'CEO', role: 'Boss' },
  relatedNames: [{ name: 'Second Employer', label: 'Employer' }],
  photoBase64: 'AAAA',
};

describe('buildVCard UID and NICKNAME', () => {
  it('emits UID after VERSION and NICKNAME after FN', () => {
    const l = lines(buildVCard(FULL, LOOKUP_SCOPE));
    expect(l[2]).toBe('UID:person-abc123');
    expect(l[l.indexOf('FN:Kring Spike') + 1]).toBe('NICKNAME:Spiky');
  });

  it('emits neither when unset', () => {
    const { uid: _u, nickname: _n, ...rest } = FULL;
    const vcf = buildVCard(rest, LOOKUP_SCOPE);
    expect(vcf).not.toContain('UID:');
    expect(vcf).not.toContain('NICKNAME:');
  });
});

describe('buildLookupVCard', () => {
  it('drops TITLE, ROLE, relatedNames, BDAY and the photo', () => {
    const vcf = buildLookupVCard(FULL);
    expect(vcf).toContain('ORG:Acme AG\r\n');
    for (const absent of ['TITLE', 'ROLE', 'X-ABRELATEDNAMES', 'BDAY', 'PHOTO']) {
      expect(vcf).not.toContain(absent);
    }
    expect(vcf).toContain('TEL;TYPE=CELL');
    expect(vcf).toContain('spike@example.invalid');
  });

  it('keeps the postal address and the website (owner, 2026-11-17)', () => {
    const vcf = buildLookupVCard(FULL);
    expect(vcf).toContain('ADR');
    expect(vcf).toContain('Seestrasse 1');
    expect(vcf).toContain('https://example.invalid');
  });

  it('writes the bank account as a NOTE line', () => {
    const vcf = buildLookupVCard({ ...FULL, note: 'IBAN ZKB priv: CH98 0070 0112 9000 6934 5' });
    expect(vcf).toContain('NOTE:IBAN ZKB priv: CH98 0070 0112 9000 6934 5\r\n');
    expect(buildLookupVCard(FULL)).not.toContain('NOTE');
  });

  it('omits ORG when the employer has no name', () => {
    expect(buildLookupVCard({ ...FULL, employment: { org: '' } })).not.toContain('ORG:');
  });

  it('escapes special characters', () => {
    const vcf = buildLookupVCard({ ...FULL, lastName: 'Müller, Jr.;x', nickname: 'a\nb' });
    expect(vcf).toContain('N:Müller\\, Jr.\\;x;Kring;;;');
    expect(vcf).toContain('NICKNAME:a\\nb');
  });

  it('keeps an org card a company card', () => {
    const vcf = buildLookupVCard({ kind: 'org', uid: 'org-o1', displayName: 'Acme AG', orgName: 'Acme AG', channels: [], relatedNames: [] });
    expect(vcf).toContain('X-ABShowAs:COMPANY');
    expect(vcf).toContain('UID:org-o1');
  });
});

describe('withPhoto', () => {
  it('inserts a folded PHOTO line before END:VCARD', () => {
    const base = buildLookupVCard(FULL);
    const out = withPhoto(base, 'x'.repeat(500));
    const l = lines(out);
    expect(out.endsWith('END:VCARD\r\n')).toBe(true);
    expect(out).toContain('PHOTO;ENCODING=b;TYPE=JPEG:');
    for (const line of l) expect(line.length).toBeLessThanOrEqual(75);
    expect(out.indexOf('PHOTO')).toBeLessThan(out.indexOf('END:VCARD'));
  });

  it('returns the card unchanged without a photo', () => {
    const base = buildLookupVCard(FULL);
    expect(withPhoto(base, undefined)).toBe(base);
  });
});

describe('cardEtag and bookCtag', () => {
  it('cardEtag is stable, quoted, 18 chars, and changes with avatarVersion', async () => {
    const a = await cardEtag('BEGIN:VCARD', 'avatars/p.jpg', 'v1');
    expect(a).toBe(await cardEtag('BEGIN:VCARD', 'avatars/p.jpg', 'v1'));
    expect(a).toMatch(/^"[0-9a-f]{16}"$/);
    expect(await cardEtag('BEGIN:VCARD', 'avatars/p.jpg', 'v2')).not.toBe(a);
  });

  it('bookCtag ignores insertion order', async () => {
    expect(await bookCtag({ a: '"1"', b: '"2"' })).toBe(await bookCtag({ b: '"2"', a: '"1"' }));
    expect(await bookCtag({ a: '"1"' })).not.toBe(await bookCtag({ a: '"2"' }));
  });
});
