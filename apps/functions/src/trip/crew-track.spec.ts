import { describe, expect, it } from 'vitest';
import { TripModel } from '@okr/shared-models';
import type { LocalSection } from '@okr/mobility-tracker-util';
import { clipSections, decodeStrokeTimes, decodeTrack, strokeTimesBase } from '@okr/mobility-tracker-util';
import { CREW_TRACK_MAX_SPAN_MS, crewWindowMs, decideCrewAccess, isCrewMember, isLinkedRecording, toCrewSections } from './crew-track';

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
  it('none for a soft-deleted logbuch', () => {
    expect(decideCrewAccess(logbuch({ deletedAt: '2026-10-21T10:00:00Z' }), 'p1', true, '20261021')).toBe('none');
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

describe('isLinkedRecording', () => {
  const rec = (over: Record<string, unknown> = {}) =>
    ({ type: 'tracker', tenants: ['scs'], isArchived: false, deletedAt: null, track: { logbuchKey: 'L1' }, ...over }) as never;
  it('accepts the linked recording', () => expect(isLinkedRecording(rec(), 'L1', 'scs')).toBe(true));
  it('rejects each failing condition', () => {
    expect(isLinkedRecording(undefined, 'L1', 'scs')).toBe(false);
    expect(isLinkedRecording(rec({ type: 'logbuch' }), 'L1', 'scs')).toBe(false);
    expect(isLinkedRecording(rec({ track: undefined }), 'L1', 'scs')).toBe(false);
    expect(isLinkedRecording(rec({ track: { logbuchKey: 'other' } }), 'L1', 'scs')).toBe(false);
    expect(isLinkedRecording(rec({ tenants: ['gss'] }), 'L1', 'scs')).toBe(false);
    expect(isLinkedRecording(rec({ isArchived: true }), 'L1', 'scs')).toBe(false);
    expect(isLinkedRecording(rec({ deletedAt: '2026' }), 'L1', 'scs')).toBe(false);
  });
});

describe('crewWindowMs', () => {
  it('caps a widened window at 12 h', () => {
    const t = logbuch({ startDate: '20261020', startTime: '10:00', endDate: '20261022', endTime: '10:00' });
    const w = crewWindowMs(t, 0);
    expect(w.toMs).toBe(w.fromMs + CREW_TRACK_MAX_SPAN_MS);
  });
  it('keeps a short window', () => {
    const t = logbuch({ startDate: '20261020', startTime: '10:00', endDate: '20261020', endTime: '12:00' });
    const w = crewWindowMs(t, 0);
    expect(w.toMs - w.fromMs).toBe(2 * 3_600_000 + 600_000);
  });
});

describe('clip -> crew round trip', () => {
  it('stroke times survive encoding relative to the clipped points', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ lat: 47 + i * 1e-4, lng: 8, t: 1_000_437 + i * 10_000 }));
    const strokes = [1_005_437, 1_025_437, 1_045_437, 1_085_437];
    const clipped = clipSections([{ mode: 'row', detected: false, points, strokeTimes: strokes }], 1_020_000, 1_070_000);
    const out = toCrewSections(clipped)[0];
    const decodedPoints = decodeTrack(out.encoded);
    const times = decodeStrokeTimes(out.strokeTimes, strokeTimesBase(decodedPoints));
    expect(times).toHaveLength(clipped[0].strokeTimes?.length ?? -1);
    times.forEach((x, i) => expect(Math.abs(x - (clipped[0].strokeTimes as number[])[i])).toBeLessThanOrEqual(1000));
  });
});
