import { describe, expect, it } from 'vitest';
import { buildVCard } from './vcard-generator';
import { parseVcards } from './vcard-parser';
import { ExportScope, VcardRecord } from './vcard-types';

const FULL: ExportScope = {
  identity: true, addresses: ['phone', 'email', 'postal', 'web'],
  birthday: true, photo: true, workRels: true, personalRels: true, orgLinks: false,
};

describe('parseVcards — round trip against buildVCard', () => {
  it('reproduces a person record', () => {
    const record: VcardRecord = {
      kind: 'person', firstName: 'Anna', lastName: 'Muster', displayName: 'Anna Muster',
      bday: '1985-04-15',
      channels: [
        { channel: 'phone', type: 'WORK', pref: true, value: '+41 44 123 45 67' },
        { channel: 'email', type: 'HOME', value: 'anna@example.ch' },
        { channel: 'postal', type: 'HOME', street: 'Bahnhofstrasse 1', city: 'Zürich', region: 'ZH', zip: '8001', country: 'Schweiz' },
        { channel: 'web', value: 'https://example.ch', label: 'Blog' },
      ],
      employment: { org: 'Acme AG', department: 'IT', title: 'CTO', role: 'Leitung' },
      relatedNames: [{ name: 'Beat Muster', label: '_$!<Spouse>!$_' }],
    };
    const [parsed] = parseVcards(buildVCard(record, FULL), 'k.vcf');
    expect(parsed.kind).toBe('person');
    expect(parsed.firstName).toBe('Anna');
    expect(parsed.lastName).toBe('Muster');
    expect(parsed.bday).toBe('1985-04-15');
    expect(parsed.employment).toEqual({ org: 'Acme AG', department: 'IT', title: 'CTO', role: 'Leitung' });
    expect(parsed.relatedNames).toEqual([{ name: 'Beat Muster', label: '_$!<Spouse>!$_' }]);
    expect(parsed.channels).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'phone', type: 'WORK', pref: true, value: '+41 44 123 45 67' }),
      expect.objectContaining({ channel: 'email', value: 'anna@example.ch' }),
      expect.objectContaining({ channel: 'postal', street: 'Bahnhofstrasse 1', zip: '8001', city: 'Zürich' }),
      expect.objectContaining({ channel: 'web', value: 'https://example.ch', label: 'Blog' }),
    ]));
    expect(parsed.residual).toEqual([]);
  });

  it('reproduces an org record', () => {
    const record: VcardRecord = {
      kind: 'org', displayName: 'Acme AG', orgName: 'Acme AG',
      channels: [{ channel: 'email', value: 'info@acme.ch' }], relatedNames: [],
    };
    const [parsed] = parseVcards(buildVCard(record, FULL), 'k.vcf');
    expect(parsed.kind).toBe('org');
    expect(parsed.orgName).toBe('Acme AG');
    expect(parsed.displayName).toBe('Acme AG');
  });

  it('escaped values survive the round trip', () => {
    const record: VcardRecord = {
      kind: 'person', firstName: 'A;B', lastName: 'C,D', displayName: 'A;B C,D',
      channels: [], relatedNames: [],
    };
    const [parsed] = parseVcards(buildVCard(record, FULL), 'k.vcf');
    expect(parsed.firstName).toBe('A;B');
    expect(parsed.lastName).toBe('C,D');
  });
});

describe('parseVcards — real-world dialects', () => {
  it('reads a 2.1 Outlook card', () => {
    const text = ['BEGIN:VCARD', 'VERSION:2.1', 'N:Muster;Anna', 'FN:Anna Muster',
      'TEL;CELL;VOICE:+41 79 111 22 33',
      'NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Gr=C3=BCezi', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'outlook.vcf');
    expect(parsed.lastName).toBe('Muster');
    expect(parsed.channels[0]).toMatchObject({ channel: 'phone', type: 'CELL' });
    expect(parsed.noteTexts).toEqual(['Grüezi']);
  });

  it('reads PREF=1 and RELATED from a 4.0 card', () => {
    const text = ['BEGIN:VCARD', 'VERSION:4.0', 'N:Muster;Anna;;;', 'FN:Anna Muster',
      'EMAIL;PREF=1:a@b.ch', 'RELATED;TYPE=spouse:Beat Muster', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'v4.vcf');
    expect(parsed.channels[0]).toMatchObject({ channel: 'email', pref: true });
    expect(parsed.relatedNames).toEqual([{ name: 'Beat Muster', label: 'spouse' }]);
  });

  it('derives first/last name from FN when N is absent', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Maria Muster', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf');
    expect(parsed.firstName).toBe('Anna Maria');
    expect(parsed.lastName).toBe('Muster');
  });

  it('warns and drops a card with neither N nor FN', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'EMAIL:a@b.ch', 'END:VCARD'].join('\r\n');
    expect(parseVcards(text, 'k.vcf')).toEqual([]);
  });

  it('collects unconsumed properties as residual, in source order', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster', 'NICKNAME:Anni',
      'CATEGORIES:Verein,Freunde', 'X-SOCIALPROFILE;TYPE=twitter:https://x.com/a', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf');
    expect(parsed.residual.map((p) => p.name)).toEqual(['NICKNAME', 'CATEGORIES', 'X-SOCIALPROFILE']);
  });

  it('never puts a consumed property into residual', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Muster;Anna;;;', 'FN:Anna Muster',
      'TEL:1', 'EMAIL:a@b.ch', 'BDAY:1985-04-15', 'ORG:Acme AG', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf');
    expect(parsed.residual).toEqual([]);
  });

  it('extracts DEATHDATE into deathdate and keeps it out of residual', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster', 'DEATHDATE:2020-05-01', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf');
    expect(parsed.deathdate).toBe('2020-05-01');
    expect(parsed.residual).toEqual([]);
  });

  it('falls back to X-DEATH-DATE when DEATHDATE is absent', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster', 'X-DEATH-DATE:2020-05-01', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf');
    expect(parsed.deathdate).toBe('2020-05-01');
    expect(parsed.residual).toEqual([]);
  });

  it('leaves deathdate undefined when neither property is present', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf');
    expect(parsed.deathdate).toBeUndefined();
  });

  it('sets sourceFileName on every card of the file', () => {
    const text = ['BEGIN:VCARD', 'FN:A', 'END:VCARD', 'BEGIN:VCARD', 'FN:B', 'END:VCARD'].join('\r\n');
    expect(parseVcards(text, 'kontakte.vcf').map((p) => p.sourceFileName)).toEqual(['kontakte.vcf', 'kontakte.vcf']);
  });
});
