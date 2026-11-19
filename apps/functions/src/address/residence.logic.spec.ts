import { describe, expect, it } from 'vitest';

import { AddressModel } from '@okr/shared-models';

import {
  CallerFacts, matchServerHit, mayRecordPostal, parseTarget, planCancel, planMove, postalIndex, recorderTenantId,
  requireAddressValue2, requireDocKey, requireParentKey, requireQuery, requireStoreDate, snapshotText,
} from './residence.logic';

const TODAY = '20270215';

function postal(okey: string, patch: Partial<AddressModel> = {}): AddressModel {
  const row = new AddressModel('A');
  row.okey = okey;
  row.addressChannel = 'postal';
  row.parentKey = 'person.p1';
  return Object.assign(row, patch);
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe('planMove', () => {
  it('future move: closes the current favorite the day before, new row not favorite yet', () => {
    const rows = [postal('cur', { isFavorite: true })];
    expect(planMove(rows, '20270301', TODAY)).toEqual({ close: { okey: 'cur', validTo: '20270228' }, newIsFavorite: false, demote: [] });
  });

  it('late report: closes the current favorite, new row takes the favorite, old is demoted', () => {
    const rows = [postal('cur', { isFavorite: true })];
    expect(planMove(rows, '20270210', TODAY)).toEqual({ close: { okey: 'cur', validTo: '20270209' }, newIsFavorite: true, demote: ['cur'] });
  });

  it('move today: new row is favorite at once', () => {
    const rows = [postal('cur', { isFavorite: true })];
    expect(planMove(rows, TODAY, TODAY)).toEqual({ close: { okey: 'cur', validTo: '20270214' }, newIsFavorite: true, demote: ['cur'] });
  });

  it('no postal row (Review Focus 1): nothing to close, new row favorite when the date is not in the future', () => {
    expect(planMove([], '20270210', TODAY)).toEqual({ close: undefined, newIsFavorite: true, demote: [] });
    expect(planMove([], '20270301', TODAY)).toEqual({ close: undefined, newIsFavorite: false, demote: [] });
  });

  it('ignores non-postal and archived rows', () => {
    const email = postal('mail', { addressChannel: 'email', isFavorite: true });
    const archived = postal('old', { isArchived: true, isFavorite: true });
    expect(planMove([email, archived], '20270210', TODAY)).toEqual({ close: undefined, newIsFavorite: true, demote: [] });
  });

  it('current + future row, second move after the future date (Review Focus 2): closes the FUTURE row', () => {
    const rows = [
      postal('cur', { isFavorite: true, validTo: '20270228' }),
      postal('fut', { validFrom: '20270301' }),
    ];
    expect(planMove(rows, '20270401', TODAY)).toEqual({ close: { okey: 'fut', validTo: '20270331' }, newIsFavorite: false, demote: [] });
  });

  it('rejects a move date before an announced future move (edit or cancel it first)', () => {
    const rows = [
      postal('cur', { isFavorite: true, validTo: '20270228' }),
      postal('fut', { validFrom: '20270301' }),
    ];
    expect(code(() => planMove(rows, '20270220', TODAY))).toBe('invalid-argument');
    expect(code(() => planMove(rows, '20270301', TODAY))).toBe('invalid-argument');
  });

  it('rejects a move date on or before the start of the open row (would end it before it began)', () => {
    const rows = [postal('cur', { isFavorite: true, validFrom: '20270101' })];
    expect(code(() => planMove(rows, '20270101', TODAY))).toBe('invalid-argument');
    expect(code(() => planMove(rows, '20261201', TODAY))).toBe('invalid-argument');
  });

  it('closed row not favorite but another favorite exists: new row stays non-favorite', () => {
    const rows = [
      postal('work', { addressUsage: 'work', isFavorite: true, validFrom: '20200101' }),
      postal('home', { validFrom: '20250101' }),
    ];
    expect(planMove(rows, '20270210', TODAY)).toEqual({ close: { okey: 'home', validTo: '20270209' }, newIsFavorite: false, demote: [] });
  });

  it('no favorite at all: the new row takes it (late report)', () => {
    const rows = [postal('cur')];
    expect(planMove(rows, '20270210', TODAY)).toEqual({ close: { okey: 'cur', validTo: '20270209' }, newIsFavorite: true, demote: [] });
  });

  it('never closes a row that is already closed (past)', () => {
    const rows = [postal('past', { validFrom: '20200101', validTo: '20211231' })];
    expect(planMove(rows, '20270210', TODAY)).toEqual({ close: undefined, newIsFavorite: true, demote: [] });
  });
});

describe('planCancel', () => {
  it('reopens the predecessor that ends the day before the future row', () => {
    const rows = [
      postal('cur', { isFavorite: true, validTo: '20270228' }),
      postal('fut', { validFrom: '20270301' }),
    ];
    expect(planCancel(rows, 'fut')).toEqual({ reopen: 'cur' });
  });

  it('a future row without predecessor reopens nothing', () => {
    const rows = [postal('fut', { validFrom: '20270301' })];
    expect(planCancel(rows, 'fut')).toEqual({ reopen: undefined });
  });

  it('ignores archived predecessors and unknown rows', () => {
    const rows = [
      postal('cur', { validTo: '20270228', isArchived: true }),
      postal('fut', { validFrom: '20270301' }),
    ];
    expect(planCancel(rows, 'fut')).toEqual({ reopen: undefined });
    expect(planCancel(rows, 'nope')).toEqual({ reopen: undefined });
  });
});

describe('mayRecordPostal', () => {
  const owner: CallerFacts = { personKey: 'p1', tenants: ['A'], roles: { registered: true } };
  const memberAdminA: CallerFacts = { personKey: 'x', tenants: ['A'], roles: { memberAdmin: true } };
  const privilegedB: CallerFacts = { personKey: 'x', tenants: ['B'], roles: { privileged: true } };
  const plainA: CallerFacts = { personKey: 'x', tenants: ['A'], roles: { registered: true } };

  it('owner of a person parent may record', () => {
    expect(mayRecordPostal(owner, 'person.p1', ['A'])).toBe(true);
  });

  it('owner match requires a non-empty personKey', () => {
    expect(mayRecordPostal({ ...owner, personKey: '' }, 'person.', [])).toBe(false);
  });

  it('memberAdmin / privileged / admin of a tenant of the parent may record', () => {
    expect(mayRecordPostal(memberAdminA, 'person.p1', ['A', 'C'])).toBe(true);
    expect(mayRecordPostal(privilegedB, 'org.o1', ['A', 'B'])).toBe(true);
    expect(mayRecordPostal({ ...plainA, roles: { admin: true } }, 'org.o1', ['A'])).toBe(true);
  });

  it('an admin role of another tenant is not enough', () => {
    expect(mayRecordPostal(memberAdminA, 'person.p1', ['B'])).toBe(false);
  });

  it('a plain member may not record, not even for an org of their tenant', () => {
    expect(mayRecordPostal(plainA, 'person.p1', ['A'])).toBe(false);
    expect(mayRecordPostal(plainA, 'org.o1', ['A'])).toBe(false);
  });

  it('a person key never makes the caller owner of an org', () => {
    expect(mayRecordPostal({ ...owner, personKey: 'o1' }, 'org.o1', ['A'])).toBe(false);
  });

  it('a role value other than true does not count', () => {
    expect(mayRecordPostal({ ...plainA, roles: { memberAdmin: 'true' } }, 'person.p1', ['A'])).toBe(false);
  });
});

describe('recorderTenantId', () => {
  it('takes the caller tenant shared with the parent', () => {
    expect(recorderTenantId(['B', 'A'], ['A', 'C'])).toBe('A');
  });
  it('falls back to the caller first tenant, then empty', () => {
    expect(recorderTenantId(['B'], ['A'])).toBe('B');
    expect(recorderTenantId([], ['A'])).toBe('');
  });
});

describe('input validation', () => {
  it('query: 3..200 characters after trimming', () => {
    expect(requireQuery('  bahnhofstr 3 ')).toBe('bahnhofstr 3');
    expect(code(() => requireQuery('ab'))).toBe('invalid-argument');
    expect(code(() => requireQuery('x'.repeat(201)))).toBe('invalid-argument');
    expect(code(() => requireQuery(42))).toBe('invalid-argument');
  });

  it('StoreDate: a real 8-digit date', () => {
    expect(requireStoreDate('20270301', 'validFrom')).toBe('20270301');
    expect(code(() => requireStoreDate('2027031', 'validFrom'))).toBe('invalid-argument');
    expect(code(() => requireStoreDate('20270230', 'validFrom'))).toBe('invalid-argument');
    expect(code(() => requireStoreDate('', 'validFrom'))).toBe('invalid-argument');
    expect(code(() => requireStoreDate(undefined, 'validFrom'))).toBe('invalid-argument');
  });

  it('parentKey: person.<id> or org.<id>', () => {
    expect(requireParentKey('person.p1')).toBe('person.p1');
    expect(requireParentKey('org.o-1_x')).toBe('org.o-1_x');
    expect(code(() => requireParentKey('group.g1'))).toBe('invalid-argument');
    expect(code(() => requireParentKey('person.'))).toBe('invalid-argument');
    expect(code(() => requireParentKey('person.a/b'))).toBe('invalid-argument');
  });

  it('doc key: plain id', () => {
    expect(requireDocKey('abc123', 'residenceKey')).toBe('abc123');
    expect(code(() => requireDocKey('a/b', 'residenceKey'))).toBe('invalid-argument');
    expect(code(() => requireDocKey('', 'residenceKey'))).toBe('invalid-argument');
  });

  it('addressValue2: optional, at most 200 characters', () => {
    expect(requireAddressValue2(undefined)).toBe('');
    expect(requireAddressValue2(' c/o Muster ')).toBe('c/o Muster');
    expect(code(() => requireAddressValue2('x'.repeat(201)))).toBe('invalid-argument');
    expect(code(() => requireAddressValue2(5))).toBe('invalid-argument');
  });
});

describe('parseTarget', () => {
  const hit = { egaid: '101', streetName: 'Seestrasse', streetNumber: '12', zipCode: '8712', city: 'Stäfa', latitude: 47.2, longitude: 8.7, label: 'Seestrasse 12 8712 Stäfa' };
  const manual = { streetName: 'Rue X', streetNumber: '1', zipCode: '75001', city: 'Paris', countryCode: 'fr' };

  it('a hit is reduced to egaid + label (the server re-searches)', () => {
    expect(parseTarget({ hit })).toEqual({ kind: 'hit', egaid: '101', label: 'Seestrasse 12 8712 Stäfa' });
    expect(parseTarget({ egaid: '101', hit })).toEqual({ kind: 'hit', egaid: '101', label: 'Seestrasse 12 8712 Stäfa' });
  });

  it('egaid alone is rejected, as is an egaid that disagrees with the hit', () => {
    expect(code(() => parseTarget({ egaid: '101' }))).toBe('invalid-argument');
    expect(code(() => parseTarget({ egaid: '102', hit }))).toBe('invalid-argument');
  });

  it('a manual address is trimmed and the country upper-cased', () => {
    expect(parseTarget({ manual })).toEqual({ kind: 'manual', manual: { ...manual, countryCode: 'FR' } });
  });

  it('rejects malformed targets', () => {
    expect(code(() => parseTarget(undefined))).toBe('invalid-argument');
    expect(code(() => parseTarget({}))).toBe('invalid-argument');
    expect(code(() => parseTarget({ hit, manual }))).toBe('invalid-argument');
    expect(code(() => parseTarget({ hit: { ...hit, egaid: 'abc' } }))).toBe('invalid-argument');
    expect(code(() => parseTarget({ hit: { ...hit, label: 'ab' } }))).toBe('invalid-argument');
    expect(code(() => parseTarget({ manual: { ...manual, city: '' } }))).toBe('invalid-argument');
    expect(code(() => parseTarget({ manual: { ...manual, countryCode: 'FRA' } }))).toBe('invalid-argument');
    expect(code(() => parseTarget({ manual: { ...manual, streetName: 'x'.repeat(201) } }))).toBe('invalid-argument');
  });
});

describe('matchServerHit', () => {
  const a = { egaid: '1', streetName: 'A', streetNumber: '1', zipCode: '8000', city: 'Z', latitude: 0, longitude: 0, label: 'A 1 8000 Z' };
  const b = { ...a, egaid: '2' };
  it('returns the server hit with the same egaid, else undefined', () => {
    expect(matchServerHit([a, b], '2')).toBe(b);
    expect(matchServerHit([a], '2')).toBeUndefined();
  });
});

describe('texts and index', () => {
  it('snapshotText leaves out empty parts', () => {
    expect(snapshotText({ streetName: 'Seestrasse', streetNumber: '12', zipCode: '8712', city: 'Stäfa' })).toBe('Seestrasse 12, 8712 Stäfa');
    expect(snapshotText({ streetName: '', streetNumber: '', zipCode: '', city: '' })).toBe('');
  });

  it('postalIndex mirrors the client getAddressIndex for postal rows (owner segment filled by onAddressChange)', () => {
    expect(postalIndex({ streetName: 'Seestrasse', streetNumber: '12', countryCode: 'CH', zipCode: '8712', city: 'Stäfa', parentKey: 'person.p1' }))
      .toBe('n:Seestrasse12CH8712Stäfa p:person.p1 o:');
  });
});
