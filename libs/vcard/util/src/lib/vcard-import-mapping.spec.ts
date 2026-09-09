import { describe, expect, it } from 'vitest';
import { DEFAULT_COUNTRY } from '@okr/shared-constants';
import { mapVcardType, splitStreet, toImportDraft } from './vcard-import-mapping';
import { ParsedVcard } from './vcard-parser';

const USAGES = ['home', 'work', 'mobile', 'fax'];
const TENANT = 'scs';

function parsed(over: Partial<ParsedVcard> = {}): ParsedVcard {
  return {
    kind: 'person', firstName: 'Anna', lastName: 'Muster', displayName: 'Anna Muster',
    channels: [], relatedNames: [], sourceFileName: 'k.vcf',
    residual: [], noteTexts: [], warnings: [], ...over,
  } as ParsedVcard;
}

describe('mapVcardType', () => {
  it.each([
    ['HOME', 'home'], ['WORK', 'work'], ['CELL', 'mobile'], ['MOBILE', 'mobile'],
    ['IPHONE', 'mobile'], ['FAX', 'fax'],
  ])('maps %s to %s', (token, usage) => {
    expect(mapVcardType(token, false, USAGES)).toEqual({ usage, matched: true });
  });

  it('falls back to home for a person and work for an org', () => {
    expect(mapVcardType('PAGER', false, USAGES)).toEqual({ usage: 'home', matched: false });
    expect(mapVcardType('PAGER', true, USAGES)).toEqual({ usage: 'work', matched: false });
  });

  it('falls back when the mapped usage is not a tag of this tenant', () => {
    expect(mapVcardType('FAX', false, ['home', 'work'])).toEqual({ usage: 'home', matched: false });
  });

  it('falls back for a missing type', () => {
    expect(mapVcardType(undefined, false, USAGES)).toEqual({ usage: 'home', matched: false });
  });

  it('checks the FALLBACK against the tenant too, and takes the first available usage', () => {
    // a tenant without a 'home' item would otherwise get exactly the un-editable address
    // the availability check exists to prevent.
    expect(mapVcardType('PAGER', false, ['work', 'mobile'])).toEqual({ usage: 'work', matched: false });
    expect(mapVcardType(undefined, true, ['privat', 'geschaeft'])).toEqual({ usage: 'privat', matched: false });
  });

  it('keeps the hard default only when the tenant carries no usage at all', () => {
    expect(mapVcardType(undefined, false, [])).toEqual({ usage: 'home', matched: false });
    expect(mapVcardType(undefined, true, [])).toEqual({ usage: 'work', matched: false });
  });
});

describe('splitStreet', () => {
  it('splits the trailing number off', () => {
    expect(splitStreet('Bahnhofstrasse 1')).toEqual({ streetName: 'Bahnhofstrasse', streetNumber: '1' });
    expect(splitStreet('Seestrasse 12a')).toEqual({ streetName: 'Seestrasse', streetNumber: '12a' });
  });
  it('leaves a street without a number alone', () => {
    expect(splitStreet('Im Grüt')).toEqual({ streetName: 'Im Grüt', streetNumber: '' });
  });
  it('handles empty input', () => {
    expect(splitStreet(undefined)).toEqual({ streetName: '', streetNumber: '' });
  });
});

describe('toImportDraft', () => {
  it('maps identity onto a PersonModel carrying the tenant', () => {
    const d = toImportDraft(parsed(), TENANT, USAGES, '09.09.2026');
    expect(d.kind).toBe('person');
    expect(d.person?.firstName).toBe('Anna');
    expect(d.person?.lastName).toBe('Muster');
    expect(d.person?.tenants).toEqual([TENANT]);
    expect(d.org).toBeUndefined();
  });

  it('maps an org card onto an OrgModel', () => {
    const d = toImportDraft(parsed({ kind: 'org', orgName: 'Acme AG', displayName: 'Acme AG' }), TENANT, USAGES, '09.09.2026');
    expect(d.org?.name).toBe('Acme AG');
    expect(d.person).toBeUndefined();
  });

  it('maps each channel onto an AddressModel with an empty parentKey', () => {
    const d = toImportDraft(parsed({ channels: [
      { channel: 'phone', type: 'CELL', pref: true, value: '+41 79 1' },
      { channel: 'email', type: 'WORK', value: 'a@b.ch' },
      { channel: 'web', value: 'https://a.ch', label: 'Blog' },
      { channel: 'postal', type: 'HOME', street: 'Bahnhofstrasse 1', zip: '8001', city: 'Zürich', country: 'Schweiz' },
    ] }), TENANT, USAGES, '09.09.2026');
    expect(d.addresses).toHaveLength(4);
    expect(d.addresses[0]).toMatchObject({ addressChannel: 'phone', addressUsage: 'mobile', phone: '+41 79 1', isFavorite: true, parentKey: '' });
    expect(d.addresses[1]).toMatchObject({ addressChannel: 'email', addressUsage: 'work', email: 'a@b.ch' });
    expect(d.addresses[2]).toMatchObject({ addressChannel: 'web', url: 'https://a.ch', addressChannelLabel: 'Blog' });
    expect(d.addresses[3]).toMatchObject({ addressChannel: 'postal', streetName: 'Bahnhofstrasse', streetNumber: '1', zipCode: '8001', city: 'Zürich', countryCode: 'CH' });
  });

  it('warns but still keeps the address when the TYPE is unknown', () => {
    const d = toImportDraft(parsed({ channels: [{ channel: 'phone', type: 'PAGER', value: '1' }] }), TENANT, USAGES, '09.09.2026');
    expect(d.addresses).toHaveLength(1);
    expect(d.addresses[0].addressUsage).toBe('home');
    expect(d.warnings.some((w) => w.includes('PAGER'))).toBe(true);
    expect(d.notes).not.toContain('TEL');
  });

  it('carries all three BDAY precisions into dob', () => {
    expect(toImportDraft(parsed({ bday: '1985-04-15' }), TENANT, USAGES, '09.09.2026').dob).toBe('19850415');
    expect(toImportDraft(parsed({ bday: '--0415' }), TENANT, USAGES, '09.09.2026').dob).toBe('00000415');
    expect(toImportDraft(parsed({ bday: '1985' }), TENANT, USAGES, '09.09.2026').dob).toBe('19850000');
  });

  it('routes an impossible birthday to notes instead of dob', () => {
    const d = toImportDraft(parsed({ bday: '2001-02-30' }), TENANT, USAGES, '09.09.2026');
    expect(d.dob).toBe('');
    expect(d.notes).toContain('2001-02-30');
    expect(d.warnings.length).toBeGreaterThan(0);
  });

  it('keeps employment and related names as names, not keys', () => {
    const d = toImportDraft(parsed({
      employment: { org: 'Acme AG', department: 'IT', title: 'CTO' },
      relatedNames: [{ name: 'Beat Muster', label: '_$!<Spouse>!$_' }],
    }), TENANT, USAGES, '09.09.2026');
    expect(d.employment).toEqual({ orgName: 'Acme AG', department: 'IT', title: 'CTO', role: '' });
    expect(d.relatedNames).toEqual([{ name: 'Beat Muster', label: '_$!<Spouse>!$_' }]);
  });

  it('resolves an English country name, not only the German one', () => {
    const d = toImportDraft(parsed({ channels: [
      { channel: 'postal', type: 'HOME', street: 'Hauptstrasse 1', zip: '8001', city: 'Zürich', country: 'Switzerland' },
    ] }), TENANT, USAGES, '09.09.2026');
    expect(d.addresses[0]).toMatchObject({ addressChannel: 'postal', countryCode: 'CH' });
    expect(d.warnings).toEqual([]);
  });

  it.each(['Suisse', 'Svizzera', 'Suiza'])('resolves the country name in %s', (name) => {
    const d = toImportDraft(parsed({ channels: [
      { channel: 'postal', type: 'HOME', street: 'Hauptstrasse 1', zip: '8001', city: 'Zürich', country: name },
    ] }), TENANT, USAGES, '09.09.2026');
    expect(d.addresses[0].countryCode).toBe('CH');
  });

  it('falls back to DEFAULT_COUNTRY and warns when the country name resolves in no language', () => {
    // '' would pass the mapper but fail address.validations (mandatory, 2 chars, upper-case),
    // leaving a record the address form cannot save. The fallback keeps the record saveable,
    // the warning keeps the substitution visible.
    const d = toImportDraft(parsed({ channels: [
      { channel: 'postal', type: 'HOME', street: 'Hauptstrasse 1', zip: '1234', city: 'Nirgends', country: 'Nirgendland' },
    ] }), TENANT, USAGES, '09.09.2026');
    expect(d.addresses[0]).toMatchObject({ addressChannel: 'postal', countryCode: DEFAULT_COUNTRY });
    expect(d.warnings.some((w) => w.includes('Nirgendland'))).toBe(true);
  });

  it('carries the ADR Ext component into addressValue2', () => {
    const d = toImportDraft(parsed({ channels: [
      { channel: 'postal', type: 'HOME', ext: 'c/o Meier', street: 'Bahnhofstrasse 1', zip: '8001', city: 'Zürich', country: 'Schweiz' },
    ] }), TENANT, USAGES, '09.09.2026');
    expect(d.addresses[0]).toMatchObject({ addressChannel: 'postal', addressValue2: 'c/o Meier' });
  });

  it('carries a valid DEATHDATE into dod', () => {
    expect(toImportDraft(parsed({ deathdate: '2020-05-01' }), TENANT, USAGES, '09.09.2026').dod).toBe('20200501');
  });

  it('routes an impossible DEATHDATE to notes instead of dod', () => {
    const d = toImportDraft(parsed({ deathdate: '2020-02-30' }), TENANT, USAGES, '09.09.2026');
    expect(d.dod).toBe('');
    expect(d.notes).toContain('2020-02-30');
    expect(d.warnings.length).toBeGreaterThan(0);
  });

  it('never emits an ssn or iban address, whatever the card carried', () => {
    const d = toImportDraft(parsed({ residual: [
      { name: 'X-AHV-NR', value: '756.1234.5678.90', rawValue: '756.1234.5678.90', params: {} },
    ] }), TENANT, USAGES, '09.09.2026');
    expect(d.addresses.some((a) => a.addressChannel === 'ssn' || a.addressChannel === 'bankaccount')).toBe(false);
    expect(d.notes).not.toContain('756.1234.5678.90');
  });
});
