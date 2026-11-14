import { describe, expect, it } from 'vitest';
import { JournalChange, TripModel } from '@okr/shared-models';
import { decodeAltitudes, decodeTrack, encodeTrack, TrackPoint } from '@okr/mobility-tracker-util';
import { formatHlc } from './journal-hlc.util';
import { materialize } from './journal-merge.util';
import { sectionImageKeys } from './journal-section.util';
import { SectionView } from './journal-view.util';
import {
  sectionImageKeysIn, simplifyTrack, TRACK_MAX_POINTS, trackCopyOf, trackKeyOf, trackOf, trackPointsOf, trackRecordFields, tracksOf,
} from './journal-track.util';

const DEVICE: Record<string, string> = { bruno: 'dev-b', anna: 'dev-a', phone: 'dev-p' };
const hlc = (wall: number, author: string, device = DEVICE[author]): string => formatHlc({ wall, counter: 0, deviceId: device });

let n = 0;
function rec(p: Pick<JournalChange, 'entity' | 'entityKey' | 'op'> & Partial<JournalChange>, wall: number, authorKey = 'bruno', deviceId = DEVICE[authorKey]): JournalChange {
  n += 1;
  return { id: `r${n}`, journalKey: 'j1', deviceId, seq: n, hlc: hlc(wall, authorKey, deviceId), authorKey, fields: {}, ...p };
}

const T0 = Date.UTC(2026, 10, 1, 8, 0, 0);

/** A straight line north from Zürich, one point per second, every 10th with an altitude. */
function line(count: number, start = 0): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 47.37 + (start + i) * 0.00001, lng: 8.54, t: T0 + (start + i) * 1000, acc: 5, ...(i % 10 === 0 ? { alt: 400 + i } : {}),
  }));
}

/** A wiggly 6-hour walk: 20,000 points on a sine around a line, so most of them matter at 5 m. */
function wiggly(count: number): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 47.0 + i * 0.00005, lng: 8.0 + Math.sin(i / 3) * 0.001, t: T0 + i * 1080, alt: 500 + Math.round(Math.sin(i / 50) * 40),
  }));
}

function trip(over: Partial<TripModel> = {}): TripModel {
  return {
    okey: 'trip1', tenants: ['bka'], isArchived: false, name: 'Uetliberg', type: 'tracker', index: '', tags: '', notes: 'private notes',
    startDate: '20261101', startTime: '0800', endDate: '20261101', endTime: '1400', locations: [],
    track: {
      personKey: 'p_bruno', ownerUid: 'uid-1', startedAt: '2026-11-01T08:00:00Z', endedAt: '2026-11-01T14:00:00Z', durationS: 21600,
      sections: [
        { mode: 'foot', detected: true, startedAt: '2026-11-01T08:00:00Z', endedAt: '2026-11-01T11:00:00Z', distanceM: 9123.4, pointsPath: 'tracks/x/0',
          steps: 12000, heartRateAvg: 120, heartRateMax: 160 },
        { mode: 'row', detected: false, startedAt: '2026-11-01T11:00:00Z', endedAt: '2026-11-01T14:00:00Z', distanceM: 5000, pointsPath: 'tracks/x/1',
          strokes: 900, strokeRateAvg: 22, strokeRateMax: 30, splitAvgS: 140, splitBestS: 120, heartRateAvg: 130 },
      ],
      photos: [
        { assetId: 'A1', takenAt: '2026-11-01T09:00:00Z', lat: 47.4, lng: 8.5, ownGps: true, hidden: false, thumbPath: 'thumbs/a1.jpg' },
        { assetId: 'A2', takenAt: '2026-11-01T08:30:00Z', lat: 47.39, lng: 8.51, ownGps: false, hidden: false },
        { assetId: 'A3', takenAt: '2026-11-01T10:00:00Z', lat: 47.41, lng: 8.52, ownGps: true, hidden: true },
        { assetId: 'A4', takenAt: '2026-11-01T10:30:00Z', lat: 47.42, lng: 8.53, ownGps: true, hidden: false }, // not imported
      ],
      journalKey: 'j1', role: 'tour',
    },
    trackRequest: { personKey: 'p_crew' },
    ...over,
  } as TripModel;
}

const SECTIONS = [
  { mode: 'foot' as const, points: line(50), steps: 12000, heartRateAvg: 120 },
  { mode: 'row' as const, points: line(50, 50), strokes: 900, strokeRates: [22, 23] },
];
const PHOTO_KEYS = { A1: 'img-a1', A2: 'img-a2', A3: 'img-a3' };

const FORBIDDEN = /heart|steps|stroke|split|crew|trackRequest|personKey|ownerUid|assetId|thumbPath|pointsPath|ownGps|hidden|notes|terrain|transit|acc$/i;

/** Every key anywhere in a JSON value, deep. */
function keysDeep(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => [k, ...keysDeep(v)]);
}

describe('trackKeyOf', () => {
  it('is one key per trip and journal, so the same trip attached twice is one entity, in another journal another one (R6)', () => {
    expect(trackKeyOf('j1', 'trip1')).toBe('trk__j1__trip1');
    expect(trackKeyOf('j1', 'trip1')).toBe(trackKeyOf('j1', 'trip1'));
    expect(trackKeyOf('j2', 'trip1')).not.toBe(trackKeyOf('j1', 'trip1'));
  });

  it('refuses a key the server key guard would refuse', () => {
    expect(trackKeyOf('j1', 'a/b')).toBeUndefined();
    expect(trackKeyOf('j1', 'x'.repeat(120))).toBeUndefined();
    expect(trackKeyOf('', 'trip1')).toBeUndefined();
    expect(trackKeyOf('j1', '')).toBeUndefined();
    const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(trackKeyOf(uuid, uuid)).toBe(`trk__${uuid}__${uuid}`); // two uuids fit
  });
});

describe('simplifyTrack', () => {
  it('drops points on a straight line, keeps first and last, and keeps their t and alt', () => {
    const points = line(200);
    const out = simplifyTrack(points);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(points[0]);
    expect(out[1]).toBe(points[199]);
    expect(out[0].alt).toBe(400);
    expect(out[0].t).toBe(T0);
  });

  it('keeps a corner further than the tolerance and drops one within it', () => {
    const base = { t: T0 };
    const corner = [{ ...base, lat: 47, lng: 8 }, { ...base, lat: 47.001, lng: 8.0001 }, { ...base, lat: 47.002, lng: 8 }]; // ~7.6 m off
    expect(simplifyTrack(corner)).toHaveLength(3);
    expect(simplifyTrack(corner, 10)).toHaveLength(2);
  });

  it('Review Focus 2: a 6-hour track with 20,000 points keeps at most 2,000, first and last included', () => {
    const points = wiggly(20000);
    expect(simplifyTrack(points, 0.5, Number.POSITIVE_INFINITY).length).toBeGreaterThan(TRACK_MAX_POINTS); // the cap really bites
    const out = simplifyTrack(points);
    expect(out.length).toBeLessThanOrEqual(TRACK_MAX_POINTS);
    expect(out.length).toBeGreaterThan(TRACK_MAX_POINTS / 2); // raised only as far as needed
    expect(out[0]).toBe(points[0]);
    expect(out[out.length - 1]).toBe(points[points.length - 1]);
    for (let i = 1; i < out.length; i++) expect(out[i].t).toBeGreaterThan(out[i - 1].t); // order kept
  });

  it('keeps short tracks as they are', () => {
    expect(simplifyTrack([])).toEqual([]);
    const one = line(1);
    expect(simplifyTrack(one)).toEqual(one);
    const two = line(2);
    expect(simplifyTrack(two)).toEqual(two);
  });
});

describe('trackCopyOf', () => {
  it('Review Focus 1: no heart rate, steps, strokes, crew or private trip field anywhere in the copy', () => {
    const copy = trackCopyOf(trip(), SECTIONS, PHOTO_KEYS);
    expect(keysDeep(copy).filter((k) => FORBIDDEN.test(k))).toEqual([]);
    expect(keysDeep(trackRecordFields('j1', copy)).filter((k) => FORBIDDEN.test(k))).toEqual([]);
    expect(JSON.stringify(copy)).not.toMatch(/private notes|p_crew|p_bruno|uid-1|thumbs\//);
  });

  it('copies the metadata the allow-list names', () => {
    const copy = trackCopyOf(trip(), SECTIONS, PHOTO_KEYS);
    expect(copy).toMatchObject({
      tripKey: 'trip1', name: 'Uetliberg', startedAt: '2026-11-01T08:00:00Z', endedAt: '2026-11-01T14:00:00Z',
      durationS: 21600, distanceM: 14123, modes: ['foot', 'row'],
    });
    expect(copy.sections.map((s) => [s.mode, s.distanceM])).toEqual([['foot', 9123], ['row', 5000]]);
  });

  it('photos: the visible ones with a journal image, in time order', () => {
    expect(trackCopyOf(trip(), SECTIONS, PHOTO_KEYS).photos).toEqual([
      { imageKey: 'img-a2', lat: 47.39, lng: 8.51, takenAt: '2026-11-01T08:30:00Z' },
      { imageKey: 'img-a1', lat: 47.4, lng: 8.5, takenAt: '2026-11-01T09:00:00Z' },
    ]);
  });

  it('round trip: the encoded points decode to the simplified points, altitudes kept', () => {
    const points = wiggly(500);
    const copy = trackCopyOf(trip(), [{ mode: 'foot', points }], {});
    const [section] = trackPointsOf(copy);
    const simplified = simplifyTrack(points);
    expect(section.points).toHaveLength(simplified.length);
    section.points.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(simplified[i].lat, 5);
      expect(p.lng).toBeCloseTo(simplified[i].lng, 5);
      expect(p.t).toBe(Math.round(simplified[i].t / 1000) * 1000);
      expect(p.alt).toBe(simplified[i].alt);
    });
    expect(decodeTrack(copy.sections[0].encoded)).toHaveLength(simplified.length);
    expect(decodeAltitudes(copy.sections[0].altitudes, simplified.length)[0]).toBe(500);
  });

  it('a section without any altitude stores none (no undefined field for Firestore)', () => {
    const flat = line(30).map(({ alt: _alt, ...p }) => p); // eslint-disable-line @typescript-eslint/no-unused-vars
    const copy = trackCopyOf(trip(), [{ mode: 'bike', points: flat }], {});
    expect('altitudes' in copy.sections[0]).toBe(false);
    expect(trackPointsOf(copy)[0].points.every((p) => p.alt === undefined)).toBe(true);
  });

  it('caps the whole track, over all its sections, at 2,000 points', () => {
    const copy = trackCopyOf(trip(), [{ mode: 'foot', points: wiggly(12000) }, { mode: 'row', points: wiggly(12000) }], {});
    const total = trackPointsOf(copy).reduce((sum, s) => sum + s.points.length, 0);
    expect(total).toBeLessThanOrEqual(TRACK_MAX_POINTS);
  });

  it('without a section distance, measures the recorded points', () => {
    const copy = trackCopyOf(trip({ track: { ...trip().track!, sections: [] } }), [{ mode: 'foot', points: line(101) }], {});
    expect(copy.sections[0].distanceM).toBeGreaterThan(105);
    expect(copy.sections[0].distanceM).toBeLessThan(118);
  });

  it('matches the codec of the tracker (the same encoding the diary reads)', () => {
    const points = line(3);
    const copy = trackCopyOf(trip(), [{ mode: 'foot', points }], {});
    expect(copy.sections[0].encoded).toBe(encodeTrack(simplifyTrack(points)));
  });
});

describe('track entity in the change log', () => {
  const copy = trackCopyOf(trip(), SECTIONS, PHOTO_KEYS);
  const key = trackKeyOf('j1', 'trip1') as string;
  const create = (wall: number, author: string, device?: string) =>
    rec({ entity: 'track', entityKey: key, op: 'create', fields: trackRecordFields('j1', copy) }, wall, author, device);

  it('tracksOf / trackOf read the copy back', () => {
    const state = materialize([create(100, 'bruno')]);
    const [view] = tracksOf(state, 'j1');
    expect(view).toMatchObject({ key, authorKey: 'bruno', tripKey: 'trip1', name: 'Uetliberg', modes: ['foot', 'row'], distanceM: 14123 });
    expect(view.photos.map((p) => p.imageKey)).toEqual(['img-a2', 'img-a1']);
    expect(trackOf(state, 'j1', key)).toEqual(view);
    expect(tracksOf(state, 'other')).toEqual([]);
    expect(trackOf(state, 'j1', 'trk__nope')).toBeUndefined();
    expect(trackOf(state, 'other', key)).toBeUndefined(); // the key of another journal's track
  });

  it('R6: the same trip attached in journals A and B is two entities; B never reads A\'s track', () => {
    const keyA = trackKeyOf('jA', 'trip1') as string;
    const keyB = trackKeyOf('jB', 'trip1') as string;
    const inA = rec({ entity: 'track', entityKey: keyA, op: 'create', fields: trackRecordFields('jA', copy) }, 100);
    const stateA = materialize([inA]);
    expect(trackOf(stateA, 'jB', keyB)).toBeUndefined(); // not attached in B yet: B must write its own
    expect(trackOf(stateA, 'jB', keyA)).toBeUndefined(); // A's key does not resolve in B
    expect(tracksOf(stateA, 'jB')).toEqual([]);
    const inB = rec({ entity: 'track', entityKey: keyB, op: 'create', fields: trackRecordFields('jB', { ...copy, name: 'in B' }) }, 200);
    const both = materialize([inA, inB]);
    expect(Object.values(both).filter((e) => e.entity === 'track')).toHaveLength(2);
    expect(trackOf(both, 'jA', keyA)?.name).toBe('Uetliberg');
    expect(trackOf(both, 'jB', keyB)?.name).toBe('in B');
  });

  it('Review Focus 3: sent by the iPhone and attached on the iPad — one entity, two sections may refer to it', () => {
    const phone = create(100, 'bruno', DEVICE['phone']);
    const ipad = create(200, 'bruno');
    const sectionA = rec({ entity: 'section', entityKey: 's1', op: 'create', fields: { footprintKey: 'f1', type: 'track', p_track: { trackKey: key } } }, 300);
    const sectionB = rec({ entity: 'section', entityKey: 's2', op: 'create', fields: { footprintKey: 'f2', type: 'track', p_track: { trackKey: key } } }, 310);
    for (const order of [[phone, ipad, sectionA, sectionB], [sectionB, ipad, sectionA, phone]]) {
      const state = materialize(order);
      expect(tracksOf(state, 'j1')).toHaveLength(1);
      expect(Object.values(state).filter((e) => e.entity === 'track')).toHaveLength(1);
    }
  });

  it('one owner: a later re-derive by the owner wins, another author never overwrites the copy', () => {
    const renamed = trackCopyOf(trip({ name: 'Uetliberg, korrigiert' }), SECTIONS, PHOTO_KEYS);
    const ownerSet = rec({ entity: 'track', entityKey: key, op: 'set', fields: trackRecordFields('j1', renamed) }, 300, 'bruno');
    const annaSet = rec({ entity: 'track', entityKey: key, op: 'set', fields: { name: 'Anna war hier' } }, 400, 'anna');
    const annaCreate = rec({ entity: 'track', entityKey: key, op: 'create', fields: trackRecordFields('j1', { ...copy, name: 'Annas Kopie' }) }, 500, 'anna');
    const state = materialize([create(100, 'bruno'), ownerSet, annaSet, annaCreate]);
    expect(trackOf(state, 'j1', key)?.name).toBe('Uetliberg, korrigiert');
    expect(trackOf(state, 'j1', key)?.authorKey).toBe('bruno');
  });

  it('an archived track is gone; a damaged record yields no view instead of throwing', () => {
    const archive = rec({ entity: 'track', entityKey: key, op: 'archive', fields: {} }, 200);
    expect(tracksOf(materialize([create(100, 'bruno'), archive]), 'j1')).toEqual([]);
    const broken = rec({ entity: 'track', entityKey: 'trk__j1__x', op: 'create', fields: { journalKey: 'j1', sections: 'nope', photos: [{ lat: 'x' }] } }, 100);
    const [view] = tracksOf(materialize([broken]), 'j1');
    expect(view.sections).toEqual([]);
    expect(view.photos).toEqual([]);
    expect(trackPointsOf(view)).toEqual([]);
  });

  it('sectionImageKeysIn: a track section shows the photos of its track; without state, none', () => {
    const state = materialize([create(100, 'bruno')]);
    const section: Pick<SectionView, 'type' | 'properties'> = { type: 'track', properties: { track: { trackKey: key } } };
    expect(sectionImageKeysIn(state, 'j1', section)).toEqual(['img-a2', 'img-a1']);
    expect(sectionImageKeysIn(state, 'j2', section)).toEqual([]); // another journal's track
    expect(sectionImageKeys(section)).toEqual([]);
    expect(sectionImageKeysIn(state, 'j1', { type: 'track', properties: { track: { trackKey: 'trk__missing' } } })).toEqual([]);
    expect(sectionImageKeysIn(state, 'j1', { type: 'album', properties: { images: [{ label: 'i1' }] } })).toEqual(['i1']);
  });
});
