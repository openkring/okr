import { describe, expect, it } from 'vitest';

import { AddressModel } from '@okr/shared-models';

import {
  CallerFacts, commitError, firstResidenceWrite, matchServerHit, mayRecordPostal, newResidenceId, parseTarget, planCancel, planMove, postalIndex, recorderTenantId,
  requireAddressUsage, requireAddressValue2, requireDocKey, requireParentKey, requireQuery, requireStoreDate, snapshotText, strayFields,
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
    expect(planMove(rows, '20270301', TODAY, 'cur')).toEqual({ from: 'cur', close: [{ okey: 'cur', validTo: '20270228' }], newIsFavorite: false, demote: [], addressUsage: 'home' });
  });

  it('late report: closes the current favorite, new row takes the favorite, old is demoted', () => {
    const rows = [postal('cur', { isFavorite: true })];
    expect(planMove(rows, '20270210', TODAY, 'cur')).toEqual({ from: 'cur', close: [{ okey: 'cur', validTo: '20270209' }], newIsFavorite: true, demote: ['cur'], addressUsage: 'home' });
  });

  it('move today: new row is favorite at once', () => {
    const rows = [postal('cur', { isFavorite: true })];
    expect(planMove(rows, TODAY, TODAY, 'cur')).toEqual({ from: 'cur', close: [{ okey: 'cur', validTo: '20270214' }], newIsFavorite: true, demote: ['cur'], addressUsage: 'home' });
  });

  it('no postal row (Review Focus 1): nothing to close, new row favorite when the date is not in the future', () => {
    expect(planMove([], '20270210', TODAY)).toEqual({ from: undefined, close: [], newIsFavorite: true, demote: [], addressUsage: 'home' });
    expect(planMove([], '20270301', TODAY)).toEqual({ from: undefined, close: [], newIsFavorite: false, demote: [], addressUsage: 'home' });
  });

  it('no postal row: the requested usage starts the chain', () => {
    expect(planMove([], '20270210', TODAY, '', 'work').addressUsage).toBe('work');
  });

  it('ignores non-postal and archived rows', () => {
    const email = postal('mail', { addressChannel: 'email', isFavorite: true });
    const archived = postal('old', { isArchived: true, isFavorite: true });
    expect(planMove([email, archived], '20270210', TODAY)).toEqual({ from: undefined, close: [], newIsFavorite: true, demote: [], addressUsage: 'home' });
  });

  it('current + future row, second move after the future date (Review Focus 2): closes the FUTURE row', () => {
    const rows = [
      postal('cur', { isFavorite: true, validTo: '20270228' }),
      postal('fut', { validFrom: '20270301' }),
    ];
    expect(planMove(rows, '20270401', TODAY, 'fut')).toEqual({ from: 'fut', close: [{ okey: 'fut', validTo: '20270331' }], newIsFavorite: false, demote: [], addressUsage: 'home' });
    // the user started from the current row: the chain still ends at the announced row
    expect(planMove(rows, '20270401', TODAY, 'cur').close).toEqual([{ okey: 'fut', validTo: '20270331' }]);
  });

  it('rejects a move date before an announced future move (edit or cancel it first)', () => {
    const rows = [
      postal('cur', { isFavorite: true, validTo: '20270228' }),
      postal('fut', { validFrom: '20270301' }),
    ];
    expect(code(() => planMove(rows, '20270220', TODAY, 'cur'))).toBe('invalid-argument');
    expect(code(() => planMove(rows, '20270301', TODAY, 'fut'))).toBe('invalid-argument');
  });

  it('rejects a move date on or before the start of the open row (would end it before it began)', () => {
    const rows = [postal('cur', { isFavorite: true, validFrom: '20270101' })];
    expect(code(() => planMove(rows, '20270101', TODAY, 'cur'))).toBe('invalid-argument');
    expect(code(() => planMove(rows, '20261201', TODAY, 'cur'))).toBe('invalid-argument');
  });

  it('requires fromOkey when an open row exists, and it must be an active postal row', () => {
    const rows = [postal('cur', { isFavorite: true }), postal('gone', { isArchived: true })];
    expect(code(() => planMove(rows, '20270301', TODAY))).toBe('invalid-argument');
    expect(code(() => planMove(rows, '20270301', TODAY, 'nope'))).toBe('invalid-argument');
    expect(code(() => planMove(rows, '20270301', TODAY, 'gone'))).toBe('invalid-argument');
  });

  it('only past rows: fromOkey optional, nothing is closed', () => {
    const rows = [postal('past', { validFrom: '20200101', validTo: '20211231' })];
    expect(planMove(rows, '20270210', TODAY)).toEqual({ from: undefined, close: [], newIsFavorite: true, demote: [], addressUsage: 'home' });
    expect(planMove(rows, '20270210', TODAY, 'past').close).toEqual([]);
  });

  describe('mixed home and work rows', () => {
    it('both open with unknown dates: a home move closes home, keeps work and its usage', () => {
      const rows = [
        postal('home', { isFavorite: true }),
        postal('work', { addressUsage: 'work' }),
      ];
      expect(planMove(rows, '20270210', TODAY, 'home')).toEqual({ from: 'home', close: [{ okey: 'home', validTo: '20270209' }], newIsFavorite: true, demote: ['home'], addressUsage: 'home' });
    });

    it('work row with a later start: a home move still closes home (not refused by the work start)', () => {
      const rows = [
        postal('home', { isFavorite: true, validFrom: '20200101' }),
        postal('work', { addressUsage: 'work', validFrom: '20270301' }),
      ];
      expect(planMove(rows, '20270210', TODAY, 'home')).toEqual({ from: 'home', close: [{ okey: 'home', validTo: '20270209' }], newIsFavorite: true, demote: ['home'], addressUsage: 'home' });
    });

    it('a work move closes work and the new row is work; the home favorite stays', () => {
      const rows = [
        postal('home', { isFavorite: true }),
        postal('work', { addressUsage: 'work', validFrom: '20250101' }),
      ];
      expect(planMove(rows, '20270210', TODAY, 'work')).toEqual({ from: 'work', close: [{ okey: 'work', validTo: '20270209' }], newIsFavorite: false, demote: [], addressUsage: 'work' });
    });
  });

  it('no favorite at all: the new row takes it (late report)', () => {
    const rows = [postal('cur')];
    expect(planMove(rows, '20270210', TODAY, 'cur')).toEqual({ from: 'cur', close: [{ okey: 'cur', validTo: '20270209' }], newIsFavorite: true, demote: [], addressUsage: 'home' });
  });

  describe('duplicate open rows of one usage (final review, Important 3)', () => {
    it('two open home rows, one favorite from another club: a move from the non-favorite closes both, the new row is favorite', () => {
      const rows = [
        postal('mine', { validFrom: '20240101' }),
        postal('club', { isFavorite: true, tenants: ['other'] }),
      ];
      expect(planMove(rows, '20270210', TODAY, 'mine')).toEqual({
        from: 'mine',
        close: [{ okey: 'club', validTo: '20270209' }, { okey: 'mine', validTo: '20270209' }],   // by start, unknown first
        newIsFavorite: true,
        demote: ['club'],
        addressUsage: 'home',
      });
    });

    it('a future move closes both but demotes nothing yet (the nightly switch moves the favorite)', () => {
      const rows = [postal('mine'), postal('club', { isFavorite: true })];
      const plan = planMove(rows, '20270301', TODAY, 'mine');
      expect(plan.close.map((c) => c.okey)).toEqual(['mine', 'club']);
      expect(plan.newIsFavorite).toBe(false);
      expect(plan.demote).toEqual([]);
    });

    it('a duplicate of another usage stays open', () => {
      const rows = [postal('a'), postal('b', { isFavorite: true }), postal('w', { addressUsage: 'work' })];
      expect(planMove(rows, '20270210', TODAY, 'a').close.map((c) => c.okey)).toEqual(['a', 'b']);
    });

    it('the refusal still applies to the latest open start of any duplicate', () => {
      const rows = [postal('a', { validFrom: '20240101' }), postal('b', { validFrom: '20270301' })];
      expect(code(() => planMove(rows, '20270220', TODAY, 'a'))).toBe('invalid-argument');
    });

    it('started from a closed row of the chain: the open favorite is the row the move follows', () => {
      const rows = [
        postal('old', { validFrom: '20200101', validTo: '20231231' }),
        postal('a', { validFrom: '20250101' }),
        postal('b', { isFavorite: true, validFrom: '20240101' }),
      ];
      const plan = planMove(rows, '20270210', TODAY, 'old');
      expect(plan.from).toBe('b');
      expect(plan.close.map((c) => c.okey)).toEqual(['b', 'a']);
    });
  });
});

describe('planCancel', () => {
  it('two rows: the predecessor is reopened (the cancelled row was open)', () => {
    const rows = [
      postal('cur', { isFavorite: true, validTo: '20270228' }),
      postal('fut', { validFrom: '20270301' }),
    ];
    expect(planCancel(rows, 'fut')).toEqual({ reopen: { okey: 'cur', validTo: '' } });
  });

  it('three rows C → F1 → F2: cancelling F1 extends C to the day before F2, never two open rows', () => {
    const rows = [
      postal('c', { isFavorite: true, validTo: '20270228' }),
      postal('f1', { validFrom: '20270301', validTo: '20270331' }),
      postal('f2', { validFrom: '20270401' }),
    ];
    expect(planCancel(rows, 'f1')).toEqual({ reopen: { okey: 'c', validTo: '20270331' } });
  });

  it('a future row with no predecessor reopens nothing', () => {
    const rows = [postal('fut', { validFrom: '20270301' })];
    expect(planCancel(rows, 'fut')).toEqual({ reopen: undefined });
  });

  it('ignores archived predecessors, other usages and unknown rows', () => {
    const rows = [
      postal('cur', { validTo: '20270228', isArchived: true }),
      postal('work', { addressUsage: 'work', validTo: '20270228' }),
      postal('fut', { validFrom: '20270301' }),
    ];
    expect(planCancel(rows, 'fut')).toEqual({ reopen: undefined });
    expect(planCancel(rows, 'nope')).toEqual({ reopen: undefined });
  });
});

describe('newResidenceId', () => {
  it('is stable per parent, date and location and differs otherwise', () => {
    const id = newResidenceId('person.p1', '20270301', 'loc1');
    expect(id).toMatch(/^res-[0-9a-f]{32}$/);
    expect(newResidenceId('person.p1', '20270301', 'loc1')).toBe(id);
    expect(newResidenceId('person.p1', '20270302', 'loc1')).not.toBe(id);
    expect(newResidenceId('person.p1', '20270301', 'loc2')).not.toBe(id);
    expect(newResidenceId('person.p2', '20270301', 'loc1')).not.toBe(id);
  });
});

describe('firstResidenceWrite', () => {
  it('creates when the id is free', () => {
    expect(firstResidenceWrite(undefined)).toBe('create');
  });
  it('overwrites an archived row (a cancelled move recorded again)', () => {
    expect(firstResidenceWrite({ isArchived: true, validFrom: '20270301' })).toBe('overwrite');
  });
  it('refuses a live row (the same move submitted twice)', () => {
    expect(firstResidenceWrite({ isArchived: false })).toBe('exists');
    expect(firstResidenceWrite({ validFrom: '20270301' })).toBe('exists');
  });
});

describe('strayFields', () => {
  it('lists the archived doc fields the new row lacks', () => {
    expect(strayFields({ a: 1, b: 2, legacy: 'x' }, { a: 3, b: 4, c: 5 })).toEqual(['legacy']);
    expect(strayFields({ a: 1 }, { a: 2 })).toEqual([]);
  });
});

describe('commitError', () => {
  it('maps a broken precondition to aborted and a duplicate create to already-exists', () => {
    expect((commitError({ code: 9 }) as { code: string }).code).toBe('aborted');
    expect((commitError({ code: 6 }) as { code: string }).code).toBe('already-exists');
  });
  it('rethrows anything else unchanged', () => {
    const err = { code: 14 };
    expect(commitError(err)).toBe(err);
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

  it('addressUsage: optional key, default home', () => {
    expect(requireAddressUsage(undefined)).toBe('home');
    expect(requireAddressUsage('work')).toBe('work');
    expect(code(() => requireAddressUsage('a b'))).toBe('invalid-argument');
    expect(code(() => requireAddressUsage(3))).toBe('invalid-argument');
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
