import { describe, expect, it } from 'vitest';

import { AddressModel } from '@okr/shared-models';

import { packGroups, planSwitch, projectionRefreshParents } from './residence-switch';

const TODAY = '20270215';

function postal(okey: string, patch: Partial<AddressModel> = {}): AddressModel {
  const row = new AddressModel('A');
  row.okey = okey;
  row.addressChannel = 'postal';
  row.parentKey = 'person.p1';
  return Object.assign(row, patch);
}

describe('planSwitch', () => {
  it('switch day: promotes the new row, demotes the old', () => {
    const old = postal('old', { isFavorite: true, validTo: '20270214' });
    const next = postal('new', { validFrom: '20270215' });
    expect(planSwitch([old, next], TODAY)).toEqual({ promote: 'new', demote: ['old'] });
  });

  it('missed night: the new row started days ago, the old favorite is long past', () => {
    const old = postal('old', { isFavorite: true, validTo: '20270209' });
    const next = postal('new', { validFrom: '20270210' });
    expect(planSwitch([old, next], TODAY)).toEqual({ promote: 'new', demote: ['old'] });
  });

  it('late-reported move: the successor wins over an older current row', () => {
    const old = postal('old', { isFavorite: true, validTo: '20270209' });
    const older = postal('older', { validFrom: '20260101' });
    const next = postal('new', { validFrom: '20270210' });
    expect(planSwitch([old, older, next], TODAY).promote).toBe('new');
  });

  it('only a future new row: nothing', () => {
    const cur = postal('cur', { isFavorite: true, validTo: '20270228' });
    const next = postal('new', { validFrom: '20270301' });
    expect(planSwitch([cur, next], TODAY)).toEqual({ promote: undefined, demote: [] });
  });

  it('move recorded for today and already favorite: nothing', () => {
    const old = postal('old', { validTo: '20270214' });
    const next = postal('new', { validFrom: '20270215', isFavorite: true });
    expect(planSwitch([old, next], TODAY)).toEqual({ promote: undefined, demote: [] });
  });

  it('no favorite: nothing is invented', () => {
    expect(planSwitch([postal('a'), postal('b', { validFrom: '20270101' })], TODAY)).toEqual({ promote: undefined, demote: [] });
  });

  it('past favorite without a current successor: nothing', () => {
    expect(planSwitch([postal('old', { isFavorite: true, validTo: '20270214' })], TODAY)).toEqual({ promote: undefined, demote: [] });
  });

  it('two favorites: the current one stays, the other is demoted', () => {
    const a = postal('a', { isFavorite: true });
    const b = postal('b', { isFavorite: true, addressUsage: 'work' });
    expect(planSwitch([a, b], TODAY)).toEqual({ promote: undefined, demote: ['b'] });
  });

  it('a future favorite is demoted only while a current favorite exists', () => {
    const cur = postal('cur', { isFavorite: true });
    const fut = postal('fut', { isFavorite: true, validFrom: '20270301' });
    expect(planSwitch([cur, fut], TODAY)).toEqual({ promote: undefined, demote: ['fut'] });
    const past = postal('past', { isFavorite: true, validTo: '20270101' });
    expect(planSwitch([past, fut], TODAY)).toEqual({ promote: undefined, demote: [] });
  });

  it('chains per usage: a work move never touches a current home favorite', () => {
    const home = postal('home', { isFavorite: true, addressUsage: 'home' });
    const workOld = postal('workOld', { addressUsage: 'work', validTo: '20270214' });
    const workNew = postal('workNew', { addressUsage: 'work', validFrom: '20270215' });
    expect(planSwitch([home, workOld, workNew], TODAY)).toEqual({ promote: undefined, demote: [] });
  });

  it('only same-usage rows take over: a past home favorite ignores the current work row', () => {
    const old = postal('old', { isFavorite: true, addressUsage: 'home', validTo: '20270214' });
    const work = postal('work', { addressUsage: 'work' });
    const home = postal('home', { addressUsage: 'home', validFrom: '20270215' });
    expect(planSwitch([old, work, home], TODAY).promote).toBe('home');
    expect(planSwitch([old, work], TODAY).promote).toBeUndefined();
  });

  it('ignores archived rows', () => {
    const old = postal('old', { isFavorite: true, validTo: '20270214' });
    const next = postal('new', { validFrom: '20270215', isArchived: true });
    expect(planSwitch([old, next], TODAY).promote).toBeUndefined();
  });
});

describe('packGroups', () => {
  it('never splits a group and keeps chunks within max', () => {
    expect(packGroups([['a', 'b'], ['c', 'd'], ['e']], 3)).toEqual([['a', 'b'], ['c', 'd', 'e']]);
  });
  it('packs whole groups up to max', () => {
    expect(packGroups([['a'], ['b', 'c'], ['d']], 4)).toEqual([['a', 'b', 'c', 'd']]);
  });
  it('an oversized single group gets a chunk of its own', () => {
    expect(packGroups([['a'], ['b', 'c', 'd'], ['e']], 2)).toEqual([['a'], ['b', 'c', 'd'], ['e']]);
  });
  it('no groups, no chunks', () => expect(packGroups([], 400)).toEqual([]));
});

describe('projectionRefreshParents', () => {
  const at = (parentKey: string, patch: Partial<AddressModel>): AddressModel => Object.assign(postal(parentKey), { parentKey }, patch);

  it('a row starting today or one that ended yesterday marks its parent', () => {
    const rows = [at('org.o1', { validFrom: '20270215' }), at('person.p2', { validTo: '20270214' })];
    expect(projectionRefreshParents(rows, TODAY)).toEqual(['org.o1', 'person.p2']);
  });

  it('a parent without any favorite is refreshed too (no switch write will reach it)', () => {
    const rows = [at('person.p1', { validTo: '20270214' }), at('person.p1', { validFrom: '20270215' })];
    expect(projectionRefreshParents(rows, TODAY)).toEqual(['person.p1']);
  });

  it('skips parents whose favorite flip committed (that write re-triggers onAddressChange)', () => {
    const rows = [at('person.p1', { validFrom: '20270215' }), at('org.o1', { validFrom: '20270215' })];
    expect(projectionRefreshParents(rows, TODAY, new Set(['person.p1']))).toEqual(['org.o1']);
  });

  it('ignores other dates, archived rows, other channels and rows without a parent', () => {
    const rows = [
      at('person.a', { validFrom: '20270214' }),
      at('person.b', { validTo: '20270215' }),
      at('person.c', { validFrom: '20270215', isArchived: true }),
      at('person.d', { validFrom: '20270215', addressChannel: 'email' }),
      at('', { validFrom: '20270215' }),
    ];
    expect(projectionRefreshParents(rows, TODAY)).toEqual([]);
  });

  it('crosses a month boundary for yesterday', () => {
    expect(projectionRefreshParents([at('person.p1', { validTo: '20270228' })], '20270301')).toEqual(['person.p1']);
  });
});
