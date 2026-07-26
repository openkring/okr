import { describe, expect, it } from 'vitest';

import { AddressModel, PersonModel, PrivacyUsage } from '@okr/shared-models';

import { buildDirectoryDoc, projectAddressesForViewer, toDirectoryEntry } from './address-projection.util';

function makeAddress(overrides: Partial<AddressModel>): AddressModel {
  const address = new AddressModel('tenant1');
  return Object.assign(address, overrides);
}

function makePerson(overrides: Partial<PersonModel> = {}): PersonModel {
  const person = new PersonModel('tenant1');
  return Object.assign(person, overrides);
}

const favoriteEmail = makeAddress({ okey: 'a1', addressChannel: 'email', email: 'fav@example.com', isFavorite: true });
const otherEmail = makeAddress({ okey: 'a2', addressChannel: 'email', email: 'other@example.com', isFavorite: false });
const favoritePhone = makeAddress({ okey: 'a3', addressChannel: 'phone', phone: '+41791234567', isFavorite: true });
const favoritePostal = makeAddress({ okey: 'a4', addressChannel: 'postal', streetName: 'Seestrasse', streetNumber: '1', zipCode: '8712', city: 'Stäfa', isFavorite: true });
const ssnAddress = makeAddress({ okey: 'a5', addressChannel: 'ssn', ssn: '756.1234.5678.97' });
const dobAddress = makeAddress({ okey: 'a6', addressChannel: 'dob', dob: '19851231' });
const bankAddress = makeAddress({ okey: 'a7', addressChannel: 'bankaccount', iban: 'CH9300762011623852957', isFavorite: true });
const allAddresses = [favoriteEmail, otherEmail, favoritePhone, favoritePostal, ssnAddress, dobAddress, bankAddress];

describe('toDirectoryEntry', () => {
  it('whitelist-copies only the DirectoryEntry fields (no iban/ssn/dob/index/tenants)', () => {
    const polluted = makeAddress({ okey: 'a9', addressChannel: 'email', email: 'x@y.z', iban: 'CH93...', ssn: '756...', dob: '19850101' });
    (polluted as unknown as Record<string, string>)['secret'] = 'leak-me';
    const entry = toDirectoryEntry(polluted) as unknown as Record<string, unknown>;
    expect(entry['addressOkey']).toBe('a9');
    expect(entry['email']).toBe('x@y.z');
    expect(entry['iban']).toBeUndefined();
    expect(entry['ssn']).toBeUndefined();
    expect(entry['dob']).toBeUndefined();
    expect(entry['secret']).toBeUndefined();
    expect(entry['tenants']).toBeUndefined();
    expect(entry['parentKey']).toBeUndefined();
  });
});

describe('buildDirectoryDoc', () => {
  it('includes registered-visible contact channels and derives the fav* conveniences', () => {
    const doc = buildDirectoryDoc('tenant1', 'person.p1', 'person', allAddresses, makePerson());
    expect(doc.okey).toBe('tenant1_person.p1');
    expect(doc.parentKey).toBe('person.p1');
    expect(doc.parentType).toBe('person');
    expect(doc.tenants).toEqual(['tenant1']);
    expect(doc.entries.map(e => e.addressOkey).sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(doc.favEmail).toBe('fav@example.com');
    expect(doc.favPhone).toBe('+41791234567');
    expect(doc.favZipCode).toBe('8712');
  });

  it('NEVER contains ssn/dob/bankaccount entries, regardless of preferences', () => {
    const openPerson = makePerson({
      usageEmail: PrivacyUsage.Public, usagePhone: PrivacyUsage.Public,
      usagePostalAddress: PrivacyUsage.Public, usageDateOfBirth: PrivacyUsage.Public,
    });
    const doc = buildDirectoryDoc('tenant1', 'person.p1', 'person', allAddresses, openPerson);
    expect(doc.entries.every(e => !['ssn', 'dob', 'bankaccount'].includes(e.addressChannel))).toBe(true);
  });

  it('excludes channels the person protected (Protected email -> no email entries, empty favEmail)', () => {
    const shyPerson = makePerson({ usageEmail: PrivacyUsage.Protected });
    const doc = buildDirectoryDoc('tenant1', 'person.p1', 'person', allAddresses, shyPerson);
    expect(doc.entries.some(e => e.addressChannel === 'email')).toBe(false);
    expect(doc.favEmail).toBe('');
    expect(doc.favPhone).toBe('+41791234567');
  });

  it('respects the tenant floor (showPhone privileged -> no phone entries)', () => {
    const doc = buildDirectoryDoc('tenant1', 'person.p1', 'person', allAddresses, makePerson(), { showPhone: 'privileged' });
    expect(doc.entries.some(e => e.addressChannel === 'phone')).toBe(false);
    expect(doc.favPhone).toBe('');
  });

  it('excludes archived addresses', () => {
    const archived = makeAddress({ okey: 'a8', addressChannel: 'email', email: 'old@example.com', isArchived: true });
    const doc = buildDirectoryDoc('tenant1', 'person.p1', 'person', [archived], makePerson());
    expect(doc.entries).toEqual([]);
  });

  it('projects org contact channels (public) but still no bankaccount', () => {
    const doc = buildDirectoryDoc('tenant1', 'org.o1', 'org', [favoriteEmail, bankAddress]);
    expect(doc.parentType).toBe('org');
    expect(doc.entries.map(e => e.addressChannel)).toEqual(['email']);
  });
});

describe('projectAddressesForViewer', () => {
  it('registered viewer: contact channels only — no ssn/dob/iban docs at all', () => {
    const visible = projectAddressesForViewer(allAddresses, 'registered', 'person', makePerson());
    expect(visible.map(a => a.okey).sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('privileged viewer: sees the vault channels including iban/ssn/dob values', () => {
    const visible = projectAddressesForViewer(allAddresses, 'privileged', 'person', makePerson());
    expect(visible.map(a => a.okey).sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']);
    expect(visible.find(a => a.okey === 'a5')?.ssn).toBe('756.1234.5678.97');
    expect(visible.find(a => a.okey === 'a7')?.iban).toBe('CH9300762011623852957');
  });

  it('registered viewer does not see Protected-preference contact channels', () => {
    const shyPerson = makePerson({ usagePhone: PrivacyUsage.Protected });
    const visible = projectAddressesForViewer(allAddresses, 'registered', 'person', shyPerson);
    expect(visible.some(a => a.addressChannel === 'phone')).toBe(false);
  });

  it('public viewer on an org: contact channels visible, bankaccount not', () => {
    const visible = projectAddressesForViewer([favoriteEmail, bankAddress], 'public', 'org');
    expect(visible.map(a => a.addressChannel)).toEqual(['email']);
  });

  it('returns whitelist copies — unknown extra fields are dropped', () => {
    const polluted = makeAddress({ okey: 'a9', addressChannel: 'email', email: 'x@y.z' });
    (polluted as unknown as Record<string, string>)['secret'] = 'leak-me';
    const visible = projectAddressesForViewer([polluted], 'registered', 'person', makePerson());
    expect((visible[0] as unknown as Record<string, unknown>)['secret']).toBeUndefined();
    expect(visible[0].email).toBe('x@y.z');
  });
});
