import { describe, expect, it } from 'vitest';
import { TripModel } from '@okr/shared-models';
import type { LocalSection } from '@okr/mobility-tracker-util';
import { decodeTrack } from '@okr/mobility-tracker-util';
import { decideCrewAccess, isCrewMember, toCrewSections } from './crew-track';

function logbuch(over: Partial<TripModel> = {}): TripModel {
  const t = new TripModel('scs');
  t.type = 'logbuch';
  t.trackKey = 'rec1';
  t.endDate = '20261020';
  t.participants = [{ key: 'p1', name1: 'A', name2: 'B', modelType: 'person', type: '', subType: '', label: '' }];
  return Object.assign(t, over);
}

const pts = (n: number, t0 = 1_000_000) =>
  Array.from({ length: n }, (_, i) => ({ lat: 47 + i * 0.0001, lng: 8, t: t0 + i * 10_000 }));

describe('isCrewMember', () => {
  it('crew member passes, others and empty personKey fail', () => {
    const t = logbuch();
    expect(isCrewMember(t, 'p1')).toBe(true);
    expect(isCrewMember(t, 'p2')).toBe(false);
    expect(isCrewMember(t, '')).toBe(false);
  });
});

describe('decideCrewAccess', () => {
  it('none when not a logbuch or no trackKey or no trip', () => {
    expect(decideCrewAccess(undefined, 'p1', true, '20261021')).toBe('none');
    expect(decideCrewAccess(logbuch({ type: 'tracker' }), 'p1', true, '20261021')).toBe('none');
    expect(decideCrewAccess(logbuch({ trackKey: undefined }), 'p1', true, '20261021')).toBe('none');
  });
  it('denied for non-crew and empty personKey', () => {
    expect(decideCrewAccess(logbuch(), 'p2', true, '20261021')).toBe('denied');
    expect(decideCrewAccess(logbuch(), '', true, '20261021')).toBe('denied');
  });
  it('none after the deadline, ok on the deadline day', () => {
    expect(decideCrewAccess(logbuch(), 'p1', true, '20261028')).toBe('none');
    expect(decideCrewAccess(logbuch(), 'p1', true, '20261027')).toBe('ok');
  });
  it('open trip never expires', () => {
    expect(decideCrewAccess(logbuch({ endDate: '' }), 'p1', true, '20990101')).toBe('ok');
  });
  it('gone when the recording is missing, else ok', () => {
    expect(decideCrewAccess(logbuch(), 'p1', false, '20261021')).toBe('gone');
    expect(decideCrewAccess(logbuch(), 'p1', true, '20261021')).toBe('ok');
  });
});

describe('toCrewSections', () => {
  it('never carries steps or heart rate', () => {
    const row: LocalSection = {
      mode: 'row', detected: false, points: pts(5),
      strokeTimes: [1_010_000, 1_020_000, 1_030_000],
    };
    const foot: LocalSection = { mode: 'foot', detected: false, points: pts(4), steps: 120 };
    const out = toCrewSections([row, foot]);
    expect(Object.keys(out[1])).not.toContain('steps');
    expect(out.some((s) => 'heartRateAvg' in s)).toBe(false);
    expect(out[0].strokes).toBe(3);
    expect(out[0].strokeTimes).toBeTruthy();
    expect(out[1].strokeTimes).toBeUndefined();
    expect(out[0].distanceM).toBeGreaterThan(0);
    expect(decodeTrack(out[0].encoded)).toHaveLength(5);
  });
});
