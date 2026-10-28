import { describe, it, expect } from 'vitest';
import { AvatarInfo, TripModel } from '@okr/shared-models';
import { isLogbuchCrew, isTransientLinkError, logbuchLinkCandidates, logbuchTripLabel, pickLogbuchPreset, withoutLogbuchLink } from './logbuch-link.util';
import type { LocalTrack } from './track-local.model';

const ME = 'p-me';
const person = (key: string, name1 = 'Anna'): AvatarInfo => ({ key, name1, name2: 'Muster', modelType: 'person', type: '', subType: '', label: '' });

function logbuch(okey: string, overrides: Partial<TripModel> = {}): TripModel {
  const t = new TripModel('scs');
  return Object.assign(t, {
    okey, type: 'logbuch', state: 'open', startDate: '20261024', startTime: '09:30', endDate: '', endTime: '',
    participants: [person(ME), person('p-other', 'Beat')],
  }, overrides);
}

describe('isLogbuchCrew', () => {
  it('true for a participant', () => expect(isLogbuchCrew(logbuch('a'), ME)).toBe(true));
  it('false for someone else', () => expect(isLogbuchCrew(logbuch('a'), 'p-x')).toBe(false));
  it('false for an empty person key', () => expect(isLogbuchCrew(logbuch('a', { participants: [person('')] }), '')).toBe(false));
});

describe('pickLogbuchPreset', () => {
  it('none for no trips', () => expect(pickLogbuchPreset([], ME)).toEqual({ kind: 'none' }));

  it('one open trip with the person', () => {
    const a = logbuch('a');
    expect(pickLogbuchPreset([a], ME)).toEqual({ kind: 'one', trip: a });
  });

  it('ignores closed trips', () => {
    expect(pickLogbuchPreset([logbuch('a', { state: 'closed' }), logbuch('b', { state: 'closed.rev' })], ME)).toEqual({ kind: 'none' });
  });

  it('counts a revised open trip as open', () => {
    const a = logbuch('a', { state: 'open.rev' });
    expect(pickLogbuchPreset([a], ME)).toEqual({ kind: 'one', trip: a });
  });

  it('ignores trips without the person', () => {
    expect(pickLogbuchPreset([logbuch('a', { participants: [person('p-other')] })], ME)).toEqual({ kind: 'none' });
  });

  it('ignores deleted, archived and non-logbuch trips', () => {
    const trips = [
      logbuch('a', { deletedAt: '2026-10-24T08:00:00Z' }),
      logbuch('b', { isArchived: true }),
      logbuch('c', { type: 'tracker' }),
    ];
    expect(pickLogbuchPreset(trips, ME)).toEqual({ kind: 'none' });
  });

  it('many: the open trips with the person, earliest first', () => {
    const late = logbuch('late', { startTime: '14:00' });
    const early = logbuch('early', { startTime: '0800' });
    const result = pickLogbuchPreset([late, logbuch('closed', { state: 'closed' }), early], ME);
    expect(result).toEqual({ kind: 'many', trips: [early, late] });
  });
});

describe('logbuchLinkCandidates', () => {
  // 20261024 09:30 Zurich = 07:30 UTC; trip 09:30-11:00 → window 09:25-11:05
  const startedAt = Date.UTC(2026, 9, 24, 7, 0);
  const endedAt = Date.UTC(2026, 9, 24, 9, 30);
  const ended = (okey: string, overrides: Partial<TripModel> = {}) =>
    logbuch(okey, { state: 'closed', endDate: '20261024', endTime: '11:00', ...overrides });

  it('keeps an ended trip that overlaps the recording', () => {
    const a = ended('a');
    expect(logbuchLinkCandidates([a], ME, startedAt, endedAt)).toEqual([a]);
  });

  it('keeps an open trip (window ends at the recording end)', () => {
    const a = logbuch('a');
    expect(logbuchLinkCandidates([a], ME, startedAt, endedAt)).toEqual([a]);
  });

  it('drops a trip that does not overlap', () => {
    expect(logbuchLinkCandidates([ended('a', { startTime: '13:00', endTime: '14:00' })], ME, startedAt, endedAt)).toEqual([]);
  });

  it('drops a trip without the person and a deleted trip', () => {
    const trips = [ended('a', { participants: [person('p-other')] }), ended('b', { state: 'deleted' })];
    expect(logbuchLinkCandidates(trips, ME, startedAt, endedAt)).toEqual([]);
  });
});

describe('isTransientLinkError', () => {
  it('network-like codes stay pending', () => {
    for (const code of ['unavailable', 'deadline-exceeded', 'aborted', 'firestore/unavailable']) {
      expect(isTransientLinkError({ code })).toBe(true);
    }
  });
  it('an error without a code (plain network failure) stays pending', () => {
    expect(isTransientLinkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransientLinkError(undefined)).toBe(true);
  });
  it('permanent codes drop the link', () => {
    for (const code of ['permission-denied', 'not-found', 'failed-precondition', 'invalid-argument', 'unauthenticated']) {
      expect(isTransientLinkError({ code })).toBe(false);
    }
  });
});

describe('logbuchTripLabel', () => {
  it('boat and time, legacy HHmm normalised', () =>
    expect(logbuchTripLabel({ resource: person('b', 'Alpha'), startTime: '0930' })).toBe('Alpha, 09:30'));
  it('HH:mm kept', () => expect(logbuchTripLabel({ resource: person('b', 'Alpha'), startTime: '14:05' })).toBe('Alpha, 14:05'));
  it('no boat: the time only', () => expect(logbuchTripLabel({ startTime: '09:30' })).toBe('09:30'));
  it('nothing known: empty', () => expect(logbuchTripLabel({ startTime: '' })).toBe(''));
});

describe('withoutLogbuchLink', () => {
  it('drops the link fields and keeps the rest', () => {
    const t: LocalTrack = {
      key: 'k', state: 'done', uploaded: true, name: 'n', startedAt: 1, sections: [],
      logbuchKey: 'a', logbuchLinked: true, resource: person('boat'),
    };
    const out = withoutLogbuchLink(t);
    expect(out).toEqual({ key: 'k', state: 'done', uploaded: true, name: 'n', startedAt: 1, sections: [], resource: person('boat') });
  });
});
