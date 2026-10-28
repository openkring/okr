import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { AvatarInfo, ReservationModel } from '@okr/shared-models';

import {
  damageInYear, filterDamages, getDamageEndDate, getDamageExportColumns, getDamageKindLabel, getLockedDays,
  isDamageReservation, isOpenLock, newDamageRecord,
} from './damage-list';
import { findActiveLockReservations } from './reservation.util';
import { ReservationI18n } from './reservation-i18n';

const boat: AvatarInfo = { key: 'boat1', name1: '', name2: 'Gig 4x', modelType: 'resource', type: 'rboat', subType: 'b4x', label: '' };
const skiff: AvatarInfo = { ...boat, key: 'boat2', name2: 'Skiff', subType: 'b1x' };

function make(partial: Partial<ReservationModel>): ReservationModel {
  return { ...new ReservationModel('scs'), resource: boat, state: 'active', ...partial } as ReservationModel;
}

/** every key resolves to itself, so assertions read the key name */
const i18n = new Proxy({}, { get: (_t, key: string) => signal(key) }) as unknown as ReservationI18n;

const openLock = make({ okey: 'open', reason: 'maintenance', startDate: '20261020', endDate: END_FUTURE_DATE_STR });
const endedLock = make({ okey: 'ended', reason: 'blocked', state: 'completed', startDate: '20261001', endDate: '20261005' });
const damage = make({ okey: 'dmg', reason: 'damage', state: 'completed', startDate: '20260815', endDate: '20260815', resource: skiff });
const course = make({ okey: 'course', reason: 'course', startDate: '20261001', endDate: '20261002' });
const room = make({ okey: 'room', reason: 'blocked', startDate: '20261001', endDate: '20261002', resource: { ...boat, type: 'realestate' } });

describe('isDamageReservation', () => {
  it('covers the two lock reasons and the damage record', () => {
    expect([openLock, endedLock, damage, course].map(isDamageReservation)).toEqual([true, true, true, false]);
  });
});

describe('newDamageRecord', () => {
  it('is a completed one-day record that never blocks the boat', () => {
    const record = newDamageRecord('scs', boat, undefined, 'Schaden: Gig 4x', 'Riss im Ausleger');
    expect(record.reason).toBe('damage');
    expect(record.state).toBe('completed');
    expect(record.endDate).toBe(record.startDate);
    expect(record.description).toBe('Riss im Ausleger');
    expect(findActiveLockReservations([record], 'boat1', record.startDate)).toEqual([]);
  });
});

describe('open lock, end date and days', () => {
  it('treats an open-ended active lock as open until today', () => {
    expect(isOpenLock(openLock)).toBe(true);
    expect(getDamageEndDate(openLock, '20261027')).toBe('20261027');
    expect(getLockedDays(openLock, '20261027')).toBe(8);
  });

  it('counts an ended lock from start to end, both included', () => {
    expect(isOpenLock(endedLock)).toBe(false);
    expect(getLockedDays(endedLock, '20261027')).toBe(5);
  });

  it('gives a damage without a lock zero days', () => {
    expect(getLockedDays(damage, '20261027')).toBe(0);
  });
});

describe('damageInYear', () => {
  it('counts a lock over New Year in both years', () => {
    const overNewYear = make({ reason: 'blocked', state: 'completed', startDate: '20251220', endDate: '20260110' });
    expect(damageInYear(overNewYear, 2025)).toBe(true);
    expect(damageInYear(overNewYear, 2026)).toBe(true);
    expect(damageInYear(overNewYear, 2027)).toBe(false);
  });

  it('keeps an open lock in every year up to today', () => {
    const old = make({ reason: 'maintenance', startDate: '20250301', endDate: END_FUTURE_DATE_STR });
    expect(damageInYear(old, 2026, '20261027')).toBe(true);
  });

  it('matches everything for "all" (99)', () => {
    expect(damageInYear(endedLock, 99)).toBe(true);
  });
});

describe('filterDamages', () => {
  const all = [course, endedLock, damage, openLock, room];

  it('keeps rowing-boat damages and locks only, newest first', () => {
    expect(filterDamages(all, 99, 'all', '20261027').map(r => r.okey)).toEqual(['open', 'ended', 'dmg']);
  });

  it('filters by boat type', () => {
    expect(filterDamages(all, 99, 'b1x', '20261027').map(r => r.okey)).toEqual(['dmg']);
  });

  it('filters by year', () => {
    expect(filterDamages(all, 2025, 'all', '20261027')).toEqual([]);
  });
});

describe('labels and export', () => {
  it('labels the three kinds', () => {
    expect([openLock, endedLock, damage].map(r => getDamageKindLabel(r, i18n)))
      .toEqual(['damage_kind_maintenance', 'damage_kind_blocked', 'damage_kind_damage']);
  });

  it('exports an open lock as open and includes the internal notes', () => {
    const columns = getDamageExportColumns(i18n, (code) => `type:${code}`, '20261027');
    const row = Object.fromEntries(columns.map(c => [c.header, c.value({ ...openLock, notes: 'Versicherung gemeldet' })]));
    expect(row['damage_to']).toBe('damage_open');
    expect(row['damage_days']).toBe('8');
    expect(row['damage_boatType']).toBe('type:b4x');
    expect(row['export_notes']).toBe('Versicherung gemeldet');
  });
});
