import { describe, expect, it } from 'vitest';
import { AddressModel } from '@okr/shared-models';
import { currentPostalRows, dayBefore, isPostalResidence, pickCurrentFavoritePostal, residenceStatus } from './residence.util';

const TODAY = '20270215';

function row(okey: string, patch: Partial<AddressModel> = {}): AddressModel {
  return Object.assign(new AddressModel('t'), { okey, addressChannel: 'postal' }, patch);
}

describe('residenceStatus', () => {
  it('is current without dates', () => expect(residenceStatus({ validFrom: '', validTo: '' }, TODAY)).toBe('current'));
  it('is future before validFrom', () => expect(residenceStatus({ validFrom: '20270301', validTo: '' }, TODAY)).toBe('future'));
  it('is past after validTo', () => expect(residenceStatus({ validFrom: '', validTo: '20270214' }, TODAY)).toBe('past'));
  it('counts the first day', () => expect(residenceStatus({ validFrom: '20270215', validTo: '' }, TODAY)).toBe('current'));
  it('counts the last day', () => expect(residenceStatus({ validFrom: '', validTo: '20270215' }, TODAY)).toBe('current'));
});

describe('isPostalResidence', () => {
  it('accepts a non-archived postal row', () => expect(isPostalResidence(row('a'))).toBe(true));
  it('rejects archived and non-postal rows', () => {
    expect(isPostalResidence(row('a', { isArchived: true }))).toBe(false);
    expect(isPostalResidence(row('a', { addressChannel: 'email' as never }))).toBe(false);
  });
});

describe('currentPostalRows / pickCurrentFavoritePostal', () => {
  it('returns undefined for an empty list', () => expect(pickCurrentFavoritePostal([], TODAY)).toBeUndefined());

  it('returns the current favorite and ignores a future favorite', () => {
    const rows = [row('a'), row('b', { isFavorite: true }), row('c', { isFavorite: true, validFrom: '20270301' })];
    expect(pickCurrentFavoritePostal(rows, TODAY)?.okey).toBe('b');
  });

  it('ignores archived and non-postal rows', () => {
    const rows = [row('a', { isFavorite: true, isArchived: true }), row('b', { isFavorite: true, addressChannel: 'email' as never }), row('c')];
    expect(currentPostalRows(rows, TODAY).map(r => r.okey)).toEqual(['c']);
    expect(pickCurrentFavoritePostal(rows, TODAY)?.okey).toBe('c');
  });

  it('falls back to the first current row by okey, never past or future', () => {
    const rows = [row('z'), row('b', { validTo: '20270101' }), row('m'), row('a', { validFrom: '20270301' })];
    expect(pickCurrentFavoritePostal(rows, TODAY)?.okey).toBe('m');
  });

  it('returns undefined when only past or future rows exist', () => {
    expect(pickCurrentFavoritePostal([row('a', { validTo: '20270101' })], TODAY)).toBeUndefined();
  });
});

describe('dayBefore', () => {
  it('handles a month boundary', () => expect(dayBefore('20270301')).toBe('20270228'));
  it('handles a leap year', () => expect(dayBefore('20280301')).toBe('20280229'));
  it('handles a year boundary', () => expect(dayBefore('20270101')).toBe('20261231'));
});
