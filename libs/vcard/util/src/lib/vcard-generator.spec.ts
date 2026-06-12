import { describe, expect, it } from 'vitest';

import { buildVCard, escapeVcardValue, foldVcardLine, toAppleRelationLabel } from './vcard-generator';
import { ExportScope, VcardRecord } from './vcard-types';

const FULL_SCOPE: ExportScope = {
  identity: true,
  addresses: ['phone', 'email', 'postal', 'web'],
  birthday: true,
  photo: true,
  workRels: true,
  personalRels: true,
  orgLinks: true,
};

function lines(vcf: string): string[] {
  return vcf.split('\r\n');
}

describe('escapeVcardValue', () => {
  it('escapes backslash, comma, semicolon and newline', () => {
    expect(escapeVcardValue('a\\b,c;d\ne')).toBe('a\\\\b\\,c\\;d\\ne');
  });
  it('handles undefined', () => {
    expect(escapeVcardValue(undefined)).toBe('');
  });
});

describe('foldVcardLine', () => {
  it('does not fold a short line', () => {
    expect(foldVcardLine('FN:Jane Doe')).toBe('FN:Jane Doe');
  });
  it('folds a long line with a leading-space continuation, each ≤ 75 octets', () => {
    const folded = foldVcardLine('NOTE:' + 'x'.repeat(200));
    const physical = folded.split('\r\n');
    expect(physical.length).toBeGreaterThan(1);
    expect(physical[0].length).toBeLessThanOrEqual(75);
    for (let i = 1; i < physical.length; i++) {
      expect(physical[i].startsWith(' ')).toBe(true);
      expect(physical[i].length).toBeLessThanOrEqual(75);
    }
    // unfolding restores the original
    const unfolded = physical.map((l, i) => (i === 0 ? l : l.slice(1))).join('');
    expect(unfolded).toBe('NOTE:' + 'x'.repeat(200));
  });
});

describe('buildVCard — person', () => {
  const person: VcardRecord = {
    kind: 'person',
    firstName: 'Jane',
    lastName: 'Doe',
    displayName: 'Jane Doe',
    bday: '1990-05-17',
    channels: [
      { channel: 'phone', type: 'WORK', pref: true, value: '+41 44 123 45 67' },
      { channel: 'email', type: 'HOME', value: 'jane@example.ch' },
      { channel: 'postal', type: 'WORK', street: 'Bahnhofstrasse 1', city: 'Zürich', zip: '8001', country: 'Schweiz' },
      { channel: 'web', value: 'https://example.ch', label: 'Blog' },
    ],
    employment: { org: 'Acme AG', title: 'CFO', role: 'employee' },
    relatedNames: [
      { name: 'Max Muster', label: '_$!<Spouse>!$_' },
      { name: 'Zweitfirma AG', label: 'Employer' },
    ],
  };

  it('emits a valid 3.0 envelope with CRLF and trailing CRLF', () => {
    const vcf = buildVCard(person, FULL_SCOPE);
    expect(vcf.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
    expect(vcf.endsWith('END:VCARD\r\n')).toBe(true);
    expect(vcf).toContain('\r\n');
  });

  it('emits N/FN and the native employment block', () => {
    const l = lines(buildVCard(person, FULL_SCOPE));
    expect(l).toContain('N:Doe;Jane;;;');
    expect(l).toContain('FN:Jane Doe');
    expect(l).toContain('ORG:Acme AG');
    expect(l).toContain('TITLE:CFO');
    expect(l).toContain('BDAY:1990-05-17');
  });

  it('emits PREF on the favorite phone and item-grouped related names', () => {
    const l = lines(buildVCard(person, FULL_SCOPE));
    expect(l.some((x) => x.startsWith('TEL;') && x.includes('PREF') && x.endsWith('+41 44 123 45 67'))).toBe(true);
    expect(l).toContain('item1.URL:https://example.ch');
    expect(l).toContain('item1.X-ABLabel:Blog');
    expect(l).toContain('item2.X-ABRELATEDNAMES:Max Muster');
    expect(l).toContain('item2.X-ABLabel:_$!<Spouse>!$_');
    expect(l).toContain('item3.X-ABRELATEDNAMES:Zweitfirma AG');
  });

  it('omits photo/birthday/relations when scope is favorites-only (tier 1)', () => {
    const favScope: ExportScope = {
      identity: true,
      addresses: ['phone', 'email', 'postal'],
      birthday: false,
      photo: false,
      workRels: false,
      personalRels: false,
      orgLinks: false,
    };
    // tier-1 assembly: the server surfaces only favorite channels — no employment,
    // no related names, no photo.
    const tier1Record: VcardRecord = {
      ...person,
      photoBase64: 'AAAA',
      employment: undefined,
      relatedNames: [],
      channels: person.channels.filter((c) => c.channel !== 'web'),
    };
    const vcf = buildVCard(tier1Record, favScope);
    expect(vcf).not.toContain('BDAY:');
    expect(vcf).not.toContain('PHOTO');
    expect(vcf).not.toContain('X-ABRELATEDNAMES');
    expect(vcf).not.toContain('ORG:'); // employment gated by workRels
    expect(vcf).not.toContain('URL:'); // web not in favorites address set
  });

  it('embeds the photo as base64 when present and enabled', () => {
    const vcf = buildVCard({ ...person, photoBase64: 'QUJD' }, FULL_SCOPE);
    expect(vcf).toContain('PHOTO;ENCODING=b;TYPE=JPEG:QUJD');
  });
});

describe('buildVCard — organization', () => {
  it('emits an empty N, ORG and X-ABShowAs:COMPANY', () => {
    const org: VcardRecord = {
      kind: 'org',
      displayName: 'Acme AG',
      orgName: 'Acme AG',
      channels: [{ channel: 'email', value: 'info@acme.ch' }],
      relatedNames: [{ name: 'Jane Doe', label: 'CFO' }],
    };
    const l = lines(buildVCard(org, FULL_SCOPE));
    expect(l).toContain('N:;;;;');
    expect(l).toContain('FN:Acme AG');
    expect(l).toContain('ORG:Acme AG');
    expect(l).toContain('X-ABShowAs:COMPANY');
    expect(l).toContain('item1.X-ABRELATEDNAMES:Jane Doe');
    expect(l).toContain('item1.X-ABLabel:CFO');
  });
});

describe('toAppleRelationLabel', () => {
  it('maps known kinds to Apple predefined labels (case-insensitive)', () => {
    expect(toAppleRelationLabel('Spouse')).toBe('_$!<Spouse>!$_');
    expect(toAppleRelationLabel('child')).toBe('_$!<Child>!$_');
  });
  it('falls back to a custom label then the raw kind then Contact', () => {
    expect(toAppleRelationLabel('coach', 'Trainer')).toBe('Trainer');
    expect(toAppleRelationLabel('coach')).toBe('coach');
    expect(toAppleRelationLabel(undefined)).toBe('Contact');
  });
});
