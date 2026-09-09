import { describe, expect, it } from 'vitest';
import { buildVCard } from './vcard-generator';
import { parseVcards } from './vcard-parser';
import { DEFAULT_VCARD_IMPORT_TEXTS, fill } from './vcard-i18n';
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
    const [parsed] = parseVcards(buildVCard(record, FULL), 'k.vcf').cards;
    expect(parsed.kind).toBe('person');
    expect(parsed.firstName).toBe('Anna');
    expect(parsed.lastName).toBe('Muster');
    expect(parsed.bday).toBe('1985-04-15');
    expect(parsed.employment).toEqual({ org: 'Acme AG', department: 'IT', title: 'CTO', role: 'Leitung' });
    // §4.4: the Apple token is DECODED — the raw token must never survive as a label.
    expect(parsed.relatedNames).toEqual([{ name: 'Beat Muster', label: '', type: 'spouse' }]);
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
    const [parsed] = parseVcards(buildVCard(record, FULL), 'k.vcf').cards;
    expect(parsed.kind).toBe('org');
    expect(parsed.orgName).toBe('Acme AG');
    expect(parsed.displayName).toBe('Acme AG');
  });

  it('escaped values survive the round trip', () => {
    const record: VcardRecord = {
      kind: 'person', firstName: 'A;B', lastName: 'C,D', displayName: 'A;B C,D',
      channels: [], relatedNames: [],
    };
    const [parsed] = parseVcards(buildVCard(record, FULL), 'k.vcf').cards;
    expect(parsed.firstName).toBe('A;B');
    expect(parsed.lastName).toBe('C,D');
  });
});

describe('parseVcards — real-world dialects', () => {
  it('reads a 2.1 Outlook card', () => {
    const text = ['BEGIN:VCARD', 'VERSION:2.1', 'N:Muster;Anna', 'FN:Anna Muster',
      'TEL;CELL;VOICE:+41 79 111 22 33',
      'NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Gr=C3=BCezi', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'outlook.vcf').cards;
    expect(parsed.lastName).toBe('Muster');
    expect(parsed.channels[0]).toMatchObject({ channel: 'phone', type: 'CELL' });
    expect(parsed.noteTexts).toEqual(['Grüezi']);
  });

  it('reads PREF=1 and RELATED from a 4.0 card', () => {
    const text = ['BEGIN:VCARD', 'VERSION:4.0', 'N:Muster;Anna;;;', 'FN:Anna Muster',
      'EMAIL;PREF=1:a@b.ch', 'RELATED;TYPE=spouse:Beat Muster', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'v4.vcf').cards;
    expect(parsed.channels[0]).toMatchObject({ channel: 'email', pref: true });
    expect(parsed.relatedNames).toEqual([{ name: 'Beat Muster', label: '', type: 'spouse' }]);
  });

  it('derives first/last name from FN when N is absent', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Maria Muster', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf').cards;
    expect(parsed.firstName).toBe('Anna Maria');
    expect(parsed.lastName).toBe('Muster');
  });

  it('warns and drops a card with neither N nor FN', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'EMAIL:a@b.ch', 'END:VCARD'].join('\r\n');
    const file = parseVcards(text, 'k.vcf');
    expect(file.cards).toEqual([]);
    expect(file.skippedCards).toBe(1);
    expect(file.warnings).toEqual([DEFAULT_VCARD_IMPORT_TEXTS.noName]);
  });

  it('keeps an unknown relation label as raw text and leaves the type unset', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster',
      'item1.X-ABRELATEDNAMES:Kim Muster', 'item1.X-ABLabel:Nachbarin', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf').cards;
    expect(parsed.relatedNames).toEqual([{ name: 'Kim Muster', label: 'Nachbarin' }]);
  });

  it('collects unconsumed properties as residual, in source order', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster', 'NICKNAME:Anni',
      'CATEGORIES:Verein,Freunde', 'X-SOCIALPROFILE;TYPE=twitter:https://x.com/a', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf').cards;
    expect(parsed.residual.map((p) => p.name)).toEqual(['NICKNAME', 'CATEGORIES', 'X-SOCIALPROFILE']);
  });

  it('never puts a consumed property into residual', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Muster;Anna;;;', 'FN:Anna Muster',
      'TEL:1', 'EMAIL:a@b.ch', 'BDAY:1985-04-15', 'ORG:Acme AG', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf').cards;
    expect(parsed.residual).toEqual([]);
  });

  it('extracts DEATHDATE into deathdate and keeps it out of residual', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster', 'DEATHDATE:2020-05-01', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf').cards;
    expect(parsed.deathdate).toBe('2020-05-01');
    expect(parsed.residual).toEqual([]);
  });

  it('falls back to X-DEATH-DATE when DEATHDATE is absent', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster', 'X-DEATH-DATE:2020-05-01', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf').cards;
    expect(parsed.deathdate).toBe('2020-05-01');
    expect(parsed.residual).toEqual([]);
  });

  it('leaves deathdate undefined when neither property is present', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf').cards;
    expect(parsed.deathdate).toBeUndefined();
  });

  it('sets sourceFileName on every card of the file', () => {
    const text = ['BEGIN:VCARD', 'FN:A', 'END:VCARD', 'BEGIN:VCARD', 'FN:B', 'END:VCARD'].join('\r\n');
    expect(parseVcards(text, 'kontakte.vcf').cards.map((p) => p.sourceFileName)).toEqual(['kontakte.vcf', 'kontakte.vcf']);
  });
});

describe('parseVcards — PHOTO / LOGO (D-6, D-8)', () => {
  const card = (...lines: string[]) => ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster', ...lines, 'END:VCARD'].join('\r\n');

  it('reads an ENCODING=b payload (3.0)', () => {
    const [parsed] = parseVcards(card('PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQ'), 'k.vcf').cards;
    expect(parsed.photoBase64).toBe('/9j/4AAQ');
    expect(parsed.warnings).toEqual([]);
  });

  it('reads an ENCODING=BASE64 payload (2.1)', () => {
    const [parsed] = parseVcards(card('PHOTO;ENCODING=BASE64;TYPE=JPEG:/9j/4AAQ'), 'k.vcf').cards;
    expect(parsed.photoBase64).toBe('/9j/4AAQ');
  });

  it('strips the data: prefix of a 4.0 inline photo, which carries no ENCODING', () => {
    const [parsed] = parseVcards(card('PHOTO:data:image/jpeg;base64,/9j/4AAQ'), 'k.vcf').cards;
    expect(parsed.photoBase64).toBe('/9j/4AAQ');
    expect(parsed.warnings).toEqual([]);
  });

  it('warns instead of silently dropping an unrecognised PHOTO shape', () => {
    const [parsed] = parseVcards(card('PHOTO;VALUE=uri:https://example.ch/a.jpg'), 'k.vcf').cards;
    expect(parsed.photoBase64).toBeUndefined();
    expect(parsed.warnings).toEqual([fill(DEFAULT_VCARD_IMPORT_TEXTS.photoFormat, { property: 'PHOTO' })]);
  });

  it('reads an org LOGO the same way and names LOGO in the warning', () => {
    const org = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Acme AG', 'ORG:Acme AG', 'X-ABShowAs:COMPANY',
      'LOGO:https://example.ch/logo.png', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(org, 'k.vcf').cards;
    expect(parsed.kind).toBe('org');
    expect(parsed.warnings).toEqual([fill(DEFAULT_VCARD_IMPORT_TEXTS.photoFormat, { property: 'LOGO' })]);
  });
});

describe('parseVcards — dropped cards leave a trace (§3.1.6)', () => {
  it('counts and warns about a block without END:VCARD', () => {
    const text = 'BEGIN:VCARD\r\nFN:A\r\n' + ['BEGIN:VCARD', 'FN:B', 'END:VCARD'].join('\r\n');
    const file = parseVcards(text, 'k.vcf');
    expect(file.cards).toHaveLength(1);
    expect(file.skippedCards).toBe(1);
    expect(file.warnings).toEqual([DEFAULT_VCARD_IMPORT_TEXTS.unterminated]);
  });

  it('reports nothing skipped for a clean file', () => {
    const file = parseVcards(['BEGIN:VCARD', 'FN:A', 'END:VCARD'].join('\r\n'), 'k.vcf');
    expect(file.skippedCards).toBe(0);
    expect(file.warnings).toEqual([]);
  });
});

describe('parseVcards — ADR Ext (§4.2)', () => {
  it('carries the Ext component into the channel', () => {
    const text = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Anna Muster',
      'ADR;TYPE=HOME:;c/o Meier;Bahnhofstrasse 1;Zürich;ZH;8001;Schweiz', 'END:VCARD'].join('\r\n');
    const [parsed] = parseVcards(text, 'k.vcf').cards;
    expect(parsed.channels[0]).toMatchObject({ channel: 'postal', ext: 'c/o Meier', street: 'Bahnhofstrasse 1', zip: '8001' });
  });
});
