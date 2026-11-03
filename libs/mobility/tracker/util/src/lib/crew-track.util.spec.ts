import { describe, it, expect } from 'vitest';
import { crewRouteItems, crewRoutesFromDate, crewToLocalSections, isExpiringApp, isKeptRecording, recordingDeleteDate } from './crew-track.util';
import type { CrewTrackSection } from './crew-track.model';
import { encodeTrack, type TrackPoint } from './track-polyline.util';
import { encodeStrokeTimes, strokeTimesBase } from './track-strokes.util';
import { buildGpx } from './track-pages.util';
import type { AvatarInfo, TripModel } from '@okr/shared-models';

const T0 = Date.UTC(2026, 9, 24, 7, 30, 0);
const rowPoints: TrackPoint[] = [
  { lat: 47.36, lng: 8.54, t: T0 },
  { lat: 47.361, lng: 8.541, t: T0 + 10_000 },
  { lat: 47.362, lng: 8.542, t: T0 + 20_000 },
];
const footPoints: TrackPoint[] = [
  { lat: 47.37, lng: 8.55, t: T0 + 60_000 },
  { lat: 47.371, lng: 8.551, t: T0 + 70_000 },
];
const strokes = [T0 + 2_000, T0 + 4_500, T0 + 7_000];

function crew(mode: CrewTrackSection['mode'], points: TrackPoint[], extra: Partial<CrewTrackSection> = {}): CrewTrackSection {
  return { mode, distanceM: 250, durationS: 20, encoded: encodeTrack(points), ...extra };
}

describe('crewToLocalSections', () => {
  it('decodes the points of each section and marks it as not detected', () => {
    const out = crewToLocalSections([crew('row', rowPoints), crew('foot', footPoints)]);
    expect(out.map((s) => s.mode)).toEqual(['row', 'foot']);
    expect(out.every((s) => s.detected === false)).toBe(true);
    expect(out[0].points.map((p) => [p.lat, p.lng, p.t])).toEqual(rowPoints.map((p) => [p.lat, p.lng, p.t]));
    expect(out[1].points).toHaveLength(2);
  });

  it('decodes the stroke times against the base of the section\'s first point', () => {
    const encoded = encodeStrokeTimes(strokes, strokeTimesBase(rowPoints));
    const [row] = crewToLocalSections([crew('row', rowPoints, { strokeTimes: encoded, strokes: 3 })]);
    expect(row.strokeTimes).toEqual(strokes);
  });

  it('leaves strokeTimes out when the section has none', () => {
    const [foot] = crewToLocalSections([crew('foot', footPoints)]);
    expect('strokeTimes' in foot).toBe(false);
  });

  it('returns no sections for an empty response', () => {
    expect(crewToLocalSections([])).toEqual([]);
  });

  it('feeds buildGpx: one <trk> per section with a <time> per point', () => {
    const gpx = buildGpx('Ausfahrt', crewToLocalSections([crew('row', rowPoints), crew('foot', footPoints)]));
    expect(gpx.match(/<trk>/g)).toHaveLength(2);
    expect(gpx.match(/<time>/g)).toHaveLength(5);
    expect(gpx).toContain(`<time>${new Date(T0).toISOString()}</time>`);
  });
});

describe('recordingDeleteDate', () => {
  const end = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h, 0).getTime();

  it('is the recording end + 7 days without a Logbuch link', () => {
    expect(recordingDeleteDate(undefined, end(2026, 10, 24), false)).toBe('20261031');
  });

  it('is the Logbuch end date + 7 days when the recording ends that day', () => {
    expect(recordingDeleteDate({ endDate: '20261024' }, end(2026, 10, 24), true)).toBe('20261031');
  });

  it('takes the later recording end when the Logbuch trip is back-dated', () => {
    expect(recordingDeleteDate({ endDate: '20261020' }, end(2026, 10, 24), true)).toBe('20261031');
  });

  it('crosses a month end', () => {
    expect(recordingDeleteDate(undefined, end(2026, 10, 28), false)).toBe('20261104');
  });

  it('uses the Logbuch deadline when the recording has no end', () => {
    expect(recordingDeleteDate({ endDate: '20261024' }, undefined, true)).toBe('20261031');
  });

  it('is empty while the linked Logbuch trip has no end date', () => {
    expect(recordingDeleteDate({ endDate: '' }, end(2026, 10, 24), true)).toBe('');
    expect(recordingDeleteDate(undefined, end(2026, 10, 24), true)).toBe('');
  });
});

describe('isExpiringApp', () => {
  it('expires in a club app', () => expect(isExpiringApp(['trip'])).toBe(true));
  it('expires with default features', () => expect(isExpiringApp(undefined)).toBe(true));
  it('never expires in a diary or journal app', () => {
    expect(isExpiringApp(['trip', 'diary'])).toBe(false);
    expect(isExpiringApp(['journal'])).toBe(false);
  });
});

describe('isKeptRecording', () => {
  it('is false for a recording only in the club tenant', () => {
    expect(isKeptRecording({ tenants: ['scs'], track: {} as TripModel['track'] }, 'scs')).toBe(false);
  });

  it('is true when the diary pull added another tenant', () => {
    expect(isKeptRecording({ tenants: ['scs', 'bka'] }, 'scs')).toBe(true);
  });

  it('is true when attached to a journal', () => {
    expect(isKeptRecording({ tenants: ['scs'], track: { journalKey: 'j1' } as TripModel['track'] }, 'scs')).toBe(true);
  });

  it('is false when the recording is not uploaded yet', () => {
    expect(isKeptRecording(undefined, 'scs')).toBe(false);
  });
});

describe('crewRouteItems', () => {
  const ME = 'p-me';
  const member = (key: string, name1: string): AvatarInfo => ({ key, name1, name2: 'Muster', modelType: 'person', type: '', subType: '', label: '' });
  const boat: AvatarInfo = { key: 'b', name1: '', name2: 'Lady in Red', modelType: 'resource', type: 'rboat', subType: 'b5x', label: '' };
  const logbuch = (okey: string, o: Partial<TripModel> = {}): TripModel => ({
    okey, type: 'logbuch', isArchived: false, tenants: ['scs'], state: 'closed', trackKey: 'rec-' + okey, trackRequest: { personKey: 'p-bruno' },
    startDate: '20261103', startTime: '06:58', endDate: '20261103', endTime: '08:39', distance: 13, resource: boat,
    participants: [member(ME, 'Barbara'), member('p-bruno', 'Bruno')], ...o,
  } as TripModel);
  const none = new Set<string>();

  it('lists an ended, linked trip with the person on the crew, with label, distance and recorder', () =>
    expect(crewRouteItems([logbuch('a')], ME, none, '20261103')).toEqual([
      { key: 'a', label: 'Lady in Red, 06:58', startDate: '20261103', distanceKm: 13, recorderName: 'Bruno' },
    ]));

  it('leaves out trips without a recording, without the person, still open or auto-closed', () => {
    const trips = [
      logbuch('noTrack', { trackKey: undefined }),
      logbuch('notCrew', { participants: [member('p-bruno', 'Bruno')] }),
      logbuch('open', { state: 'open', endDate: '', endTime: '' }),
      logbuch('openRev', { state: 'open.rev' }),
      logbuch('auto', { state: 'closed.rev' }),
    ];
    expect(crewRouteItems(trips, ME, none, '20261103')).toEqual([]);
  });

  it('leaves out deleted, archived and non-Logbuch trips', () => {
    const trips = [logbuch('del', { state: 'deleted' }), logbuch('arch', { isArchived: true }), logbuch('soft', { deletedAt: '2026-11-03' } as Partial<TripModel>), logbuch('rec', { type: 'tracker' })];
    expect(crewRouteItems(trips, ME, none, '20261103')).toEqual([]);
  });

  it('leaves out the trips the person recorded (their recording is already in the own list)', () =>
    expect(crewRouteItems([logbuch('a'), logbuch('b')], ME, new Set(['rec-a']), '20261103').map((i) => i.key)).toEqual(['b']));

  it('keeps a trip up to end + CREW_TRACK_DAYS, not a day longer', () => {
    expect(crewRouteItems([logbuch('a')], ME, none, '20261110')).toHaveLength(1);
    expect(crewRouteItems([logbuch('a')], ME, none, '20261111')).toEqual([]);
  });

  it('sorts newest first, by day and then by start time (legacy HHmm too)', () => {
    const trips = [logbuch('early', { startTime: '0630' }), logbuch('older', { startDate: '20261101', endDate: '20261101' }), logbuch('late', { startTime: '18:15' })];
    expect(crewRouteItems(trips, ME, none, '20261103').map((i) => i.key)).toEqual(['late', 'early', 'older']);
  });

  it('no recorder name when the request is missing or the recorder is not on the crew list', () => {
    expect(crewRouteItems([logbuch('a', { trackRequest: undefined })], ME, none, '20261103')[0].recorderName).toBe('');
    expect(crewRouteItems([logbuch('a', { trackRequest: { personKey: 'p-gone' } })], ME, none, '20261103')[0].recorderName).toBe('');
  });

  it('an empty person key matches nobody', () => expect(crewRouteItems([logbuch('a')], '', none, '20261103')).toEqual([]));
});

describe('crewRoutesFromDate', () => {
  it('goes back CREW_TRACK_DAYS plus one day', () => expect(crewRoutesFromDate(new Date(2026, 10, 3, 12).getTime())).toBe('20261026'));
});
