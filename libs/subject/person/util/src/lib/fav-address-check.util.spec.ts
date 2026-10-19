import { describe, expect, it } from 'vitest';

import { AddressModel, PersonModel } from '@okr/shared-models';

import { favMismatchFindings, FavMismatchTexts, findFavMismatches } from './fav-address-check.util';

const TEXTS: FavMismatchTexts = {
  detail: 'Gespeichert {cached}, Hauptadresse {fromAddress}',
  noValue: '–',
  toPerson: 'In Person übernehmen',
};

function makePerson(okey: string, firstName: string, lastName: string, favZipCode: string): PersonModel {
  const p = new PersonModel('scs');
  p.okey = okey;
  p.firstName = firstName;
  p.lastName = lastName;
  p.favZipCode = favZipCode;
  return p;
}

function makePostal(parentKey: string, zipCode: string, isFavorite = true): AddressModel {
  const a = new AddressModel('scs');
  a.parentKey = parentKey;
  a.addressChannel = 'postal';
  a.zipCode = zipCode;
  a.isFavorite = isFavorite;
  return a;
}

describe('findFavMismatches', () => {
  it('reports a cached zip that differs from the favorite postal address', () => {
    const result = findFavMismatches([makePerson('p1', 'Anna', 'Muster', '8000')], [makePostal('person.p1', '8001')]);
    expect(result).toEqual([
      { personKey: 'p1', personName: 'Anna Muster', field: 'favZipCode', cached: '8000', fromAddress: '8001' },
    ]);
  });

  it('reports nothing when the zip matches', () => {
    expect(findFavMismatches([makePerson('p1', 'Anna', 'Muster', '8001')], [makePostal('person.p1', '8001')])).toEqual([]);
  });

  it('reports nothing for a person without addresses and an empty cache', () => {
    expect(findFavMismatches([makePerson('p1', 'Anna', 'Muster', '')], [])).toEqual([]);
  });

  it('ignores addresses of other parents and non-favorite addresses', () => {
    const addresses = [makePostal('person.p2', '9000'), makePostal('person.p1', '9001', false)];
    expect(findFavMismatches([makePerson('p1', 'Anna', 'Muster', '')], addresses)).toEqual([]);
  });

  it('reports a cached zip when the person has no favorite address any more', () => {
    const result = findFavMismatches([makePerson('p1', 'Anna', 'Muster', '8000')], []);
    expect(result).toEqual([
      { personKey: 'p1', personName: 'Anna Muster', field: 'favZipCode', cached: '8000', fromAddress: '' },
    ]);
  });
});

describe('favMismatchFindings', () => {
  it('returns [] for no mismatches', () => {
    expect(favMismatchFindings([], TEXTS)).toEqual([]);
  });

  it('builds one finding with the toPerson action and the person route', () => {
    const findings = favMismatchFindings(
      [{ personKey: 'p1', personName: 'Anna Muster', field: 'favZipCode', cached: '8000', fromAddress: '8001' }], TEXTS);
    expect(findings).toEqual([{
      id: 'p1:favZipCode',
      title: 'Anna Muster',
      detail: 'Gespeichert 8000, Hauptadresse 8001',
      url: '/person/p1',
      actions: [{ id: 'toPerson', label: 'In Person übernehmen' }],
    }]);
  });

  it('shows the placeholder for an empty side and encodes the okey in the url', () => {
    const findings = favMismatchFindings(
      [{ personKey: 'a b/c', personName: 'X Y', field: 'favZipCode', cached: '', fromAddress: '8001' }], TEXTS);
    expect(findings[0].detail).toBe('Gespeichert –, Hauptadresse 8001');
    expect(findings[0].url).toBe('/person/a%20b%2Fc');
  });
});
