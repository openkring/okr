import { describe, expect, it } from 'vitest';
import { TripModel } from '@okr/shared-models';
import type { LocalSection } from '@okr/mobility-tracker-util';
import { clipSections, decodeStrokeTimes, decodeTrack, strokeTimesBase } from '@okr/mobility-tracker-util';
import {
  buildCrewCopy, CREW_TRACK_MAX_SPAN_MS, crewPushTexts, crewTrackActions, crewWindowMs, decideCrewAccess, isCrewMember,
  isLinkedRecording, selectCrewDiaryTarget, toCrewSections,
} from './crew-track';

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

const person = (key: string) => ({ key, name1: key, name2: '', modelType: 'person' as const, type: '', subType: '', label: '' });

function openLogbuch(over: Partial<TripModel> = {}): TripModel {
  return logbuch({ state: 'open', trackKey: undefined, endDate: '', trackRequest: { personKey: 'p1' }, ...over });
}

function tracker(over: Partial<TripModel> = {}, track: Record<string, unknown> = {}): TripModel {
  const t = new TripModel('scs');
  t.type = 'tracker';
  t.state = 'done';
  t.track = { personKey: 'p1', ownerUid: 'u1', startedAt: '', endedAt: '', durationS: 0, sections: [], photos: [], ...track };
  return Object.assign(t, over);
}

describe('crewTrackActions', () => {
  it('create with a request -> requestPush', () => {
    expect(crewTrackActions(undefined, openLogbuch())).toEqual(['requestPush']);
  });
  it('request newly set on an existing open trip -> requestPush', () => {
    expect(crewTrackActions(openLogbuch({ trackRequest: undefined }), openLogbuch())).toEqual(['requestPush']);
  });
  it('same doc rewritten unchanged -> []', () => {
    expect(crewTrackActions(openLogbuch(), openLogbuch())).toEqual([]);
    const ended = logbuch({ state: 'closed', trackKey: 'rec1' });
    expect(crewTrackActions(ended, ended)).toEqual([]);
  });
  it('no request push once a recording is linked', () => {
    expect(crewTrackActions(undefined, openLogbuch({ trackKey: 'rec1' }))).toEqual([]);
  });
  it('end with trackKey -> stopPush and copies', () => {
    const out = crewTrackActions(openLogbuch({ trackKey: 'rec1' }), logbuch({ state: 'closed', trackKey: 'rec1' }));
    expect(out).toContain('stopPush');
    expect(out).toContain('copies');
  });
  it('end without trackKey -> []', () => {
    expect(crewTrackActions(openLogbuch(), logbuch({ state: 'closed', trackKey: undefined }))).toEqual([]);
  });
  it('trackKey linked after the end -> copies only', () => {
    expect(crewTrackActions(logbuch({ state: 'closed', trackKey: undefined }), logbuch({ state: 'closed', trackKey: 'rec1' })))
      .toEqual(['copies']);
  });
  it('tracker trip with logbuchKey -> copies', () => {
    expect(crewTrackActions(undefined, tracker({}, { logbuchKey: 'L1' }))).toEqual(['copies']);
  });
  it('tracker trip without logbuchKey -> []', () => {
    expect(crewTrackActions(undefined, tracker())).toEqual([]);
  });
  it('tracker trip re-uploaded with the same logbuchKey -> []', () => {
    expect(crewTrackActions(tracker({}, { logbuchKey: 'L1' }), tracker({}, { logbuchKey: 'L1' }))).toEqual([]);
  });
  it('a crew copy (copyOf set) -> [] even with a logbuchKey', () => {
    expect(crewTrackActions(undefined, tracker({}, { copyOf: 'rec1' }))).toEqual([]);
    expect(crewTrackActions(undefined, tracker({}, { copyOf: 'rec1', logbuchKey: 'L1' }))).toEqual([]);
  });
  it('after undefined (delete) -> []', () => {
    expect(crewTrackActions(logbuch({ state: 'closed' }), undefined)).toEqual([]);
    expect(crewTrackActions(tracker({}, { logbuchKey: 'L1' }), undefined)).toEqual([]);
  });
});

describe('crewPushTexts', () => {
  it('request names boat and time (HHmm normalised)', () => {
    const t = openLogbuch({ okey: 'L1', startTime: '0930', resource: { ...person('b1'), modelType: 'resource', name1: 'Gig 4' } });
    expect(crewPushTexts.request(t)).toEqual({
      title: 'Logbuch: Gig 4, 09:30', body: 'Strecke aufzeichnen?', url: '/tracker?logbuch=L1', type: 'trackRequest',
    });
  });
  it('request without a boat keeps the time', () => {
    expect(crewPushTexts.request(openLogbuch({ okey: 'L1', startTime: '09:30' })).title).toBe('Logbuch: 09:30');
  });
  it('stop', () => {
    expect(crewPushTexts.stop()).toEqual({ title: 'Ausfahrt beendet', body: 'Aufzeichnung stoppen?', url: '/tracker', type: 'trackStop' });
  });
});

describe('selectCrewDiaryTarget', () => {
  const target = (tenantId: string, sources: string[] = ['tracker']) => ({ tenantId, sources, from: '', to: '' });
  it('routes by the source-tenant user and drops the source tenant', () => {
    const users = [
      { id: 'uScs', tenants: ['scs'], diaryTargets: [target('scs'), target('bkd')] },
      { id: 'uBkd', tenants: ['bkd'] },
    ];
    expect(selectCrewDiaryTarget(users as never, 'scs', '20261027')).toEqual({ tenants: ['bkd'], uid: 'uBkd' });
  });
  it('undefined without a user in the source tenant, without tracker targets, or without a diary user', () => {
    expect(selectCrewDiaryTarget([{ id: 'u', tenants: ['gss'], diaryTargets: [target('bkd')] }] as never, 'scs', '20261027')).toBeUndefined();
    expect(selectCrewDiaryTarget([{ id: 'u', tenants: ['scs'], diaryTargets: [target('bkd', ['tripDone'])] }, { id: 'v', tenants: ['bkd'] }] as never, 'scs', '20261027')).toBeUndefined();
    expect(selectCrewDiaryTarget([{ id: 'u', tenants: ['scs'], diaryTargets: [target('bkd')] }] as never, 'scs', '20261027')).toBeUndefined();
  });
  it('ignores an archived source user', () => {
    const users = [{ id: 'u', tenants: ['scs'], isArchived: true, diaryTargets: [target('bkd')] }, { id: 'v', tenants: ['bkd'] }];
    expect(selectCrewDiaryTarget(users as never, 'scs', '20261027')).toBeUndefined();
  });
});

describe('buildCrewCopy', () => {
  const t0 = Date.UTC(2026, 9, 27, 8, 0, 0); // 09:00 Zurich (CET since 25.10.)
  const row: LocalSection = {
    mode: 'row', detected: false, points: pts(10, t0), strokeTimes: [t0 + 5_000, t0 + 25_000, t0 + 45_000],
  };
  const foot: LocalSection = { mode: 'foot', detected: false, points: pts(4, t0 + 100_000), steps: 50 };
  const lb = logbuch({
    okey: 'L1', name: 'Morgenrunde', state: 'closed',
    resource: { ...person('b1'), modelType: 'resource', name1: 'Gig 4' },
  });
  const copy = buildCrewCopy({ logbuch: lb, recordingKey: 'rec1', personKey: 'p2', uid: 'u2', tenants: ['bkd'], clipped: [row, foot] });

  it('deterministic id, owner and copyOf, no logbuchKey', () => {
    expect(copy?.id).toBe('rec1_p2');
    expect(copy?.trip.track?.personKey).toBe('p2');
    expect(copy?.trip.track?.ownerUid).toBe('u2');
    expect(copy?.trip.track?.copyOf).toBe('rec1');
    expect(copy?.trip.track && 'logbuchKey' in copy.trip.track).toBe(false);
    expect(copy?.trip.tenants).toEqual(['bkd']);
    expect(copy?.trip.type).toBe('tracker');
    expect(copy?.trip.state).toBe('done');
    expect(copy?.trip.name).toBe('Morgenrunde');
    expect(copy?.trip.resource?.name1).toBe('Gig 4');
    expect(copy?.trip.participants).toEqual([]);
  });
  it('no steps, heart rate, photos or notes', () => {
    expect(copy?.trip.track?.photos).toEqual([]);
    expect(copy?.trip.notes).toBe('');
    for (const s of copy?.trip.track?.sections ?? []) {
      expect('steps' in s).toBe(false);
      expect('heartRateAvg' in s || 'heartRateMax' in s).toBe(false);
    }
    expect(copy?.trip.track?.sections[0].strokes).toBe(3);
  });
  it('span, wall clock and points docs', () => {
    const end = t0 + 100_000 + 30_000;
    expect(copy?.trip.track?.startedAt).toBe(new Date(t0).toISOString());
    expect(copy?.trip.track?.endedAt).toBe(new Date(end).toISOString());
    expect(copy?.trip.track?.durationS).toBe(130);
    expect(copy?.trip.startDate).toBe('20261027');
    expect(copy?.trip.startTime).toBe('09:00');
    expect(copy?.trip.endTime).toBe('09:02');
    expect(copy?.trip.index).toBe('d:20261027');
    expect(copy?.trip.track?.sections.map((s) => s.pointsPath)).toEqual(['trips/rec1_p2/track-points/0', 'trips/rec1_p2/track-points/1']);
    expect(copy?.points).toHaveLength(2);
    expect(copy?.points[0]).toMatchObject({ tenants: ['bkd'], section: 0, mode: 'row', count: 10 });
    expect(copy?.points[0].strokeTimes).toBeTruthy();
    expect(copy?.points[1].strokeTimes).toBeUndefined();
    expect(decodeTrack(copy?.points[1].encoded ?? '')).toHaveLength(4);
  });
  it('nothing to copy -> undefined', () => {
    expect(buildCrewCopy({ logbuch: lb, recordingKey: 'rec1', personKey: 'p2', uid: 'u2', tenants: ['bkd'], clipped: [] })).toBeUndefined();
  });
});
