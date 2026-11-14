import { describe, expect, it } from 'vitest';
import { TripModel } from '@okr/shared-models';
import { JOURNAL_MAP_LAYER_IDS } from '@okr/cms-section-util';

import { BASE_LAYER_IDS, BaseLayerOption } from './journal-base-layer.util';
import { GIBS_BLUE_MARBLE } from './journal-map.util';
import { TrackView } from './journal-track.util';
import {
  boundsOf, localWallClock, trackDate, trackPhotoPlan, trackPickItems, trackSummary, trackTileSources,
} from './journal-track-pick.util';
import { ImageView } from './journal-view.util';

function trip(okey: string, startedAt: string, over: Partial<TripModel> = {}): TripModel {
  return {
    okey, name: `Trip ${okey}`, type: 'tracker', startDate: startedAt.slice(0, 10).replace(/-/g, ''),
    track: {
      personKey: 'p1', ownerUid: 'u1', startedAt, endedAt: startedAt, durationS: 60, photos: [],
      sections: [
        { mode: 'foot', detected: true, startedAt, endedAt: startedAt, distanceM: 1000.4, pointsPath: '' },
        { mode: 'train', detected: true, startedAt, endedAt: startedAt, distanceM: 2000, pointsPath: '' },
        { mode: 'foot', detected: true, startedAt, endedAt: startedAt, distanceM: 500, pointsPath: '' },
      ],
    },
    ...over,
  } as TripModel;
}

function track(key: string, startedAt: string): TrackView {
  return { key, authorKey: 'p2', tripKey: key.replace('trk__', ''), name: `Track ${key}`, startedAt, endedAt: startedAt, distanceM: 42, durationS: 1,
    modes: ['bike'], sections: [], photos: [] };
}

function image(key: string, over: Partial<ImageView> = {}): ImageView {
  return { key, authorKey: 'p1', width: 1, height: 1, path2048: '', path400: '', localIdentifier: '', ...over };
}

describe('the journal map layer ids', () => {
  it('the map section form offers exactly the journal base layers (hand-synced list in cms-section-util)', () => {
    expect([...JOURNAL_MAP_LAYER_IDS]).toEqual([...BASE_LAYER_IDS]);
  });
});

describe('localWallClock / trackDate', () => {
  it('turns an ISO instant into this device’s wall clock and view date', () => {
    const iso = '2026-11-01T08:05:09Z';
    const d = new Date(iso);
    const two = (n: number) => String(n).padStart(2, '0');
    expect(localWallClock(iso)).toBe(`${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}:09`);
    expect(trackDate(iso)).toBe(`${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`);
  });

  it('gives empty strings for an unreadable instant', () => {
    expect(localWallClock('')).toBe('');
    expect(localWallClock('nonsense')).toBe('');
    expect(trackDate('')).toBe('');
  });
});

describe('trackSummary', () => {
  it('joins name, date and distance', () => {
    const summary = trackSummary({ name: 'Uetliberg', startedAt: '2026-11-01T12:00:00Z', distanceM: 12345 }, 'Strecke');
    expect(summary).toBe(`Uetliberg · ${trackDate('2026-11-01T12:00:00Z')} · 12.3 km`);
  });

  it('takes the fallback name and leaves out empty parts', () => {
    expect(trackSummary({ name: '  ', startedAt: '', distanceM: 0 }, 'Strecke')).toBe('Strecke');
  });
});

describe('trackPickItems', () => {
  it('puts the footprint day on top, then my other trips, then the journal’s other tracks — each newest first, each once', () => {
    const mine = [trip('t3', '2026-11-03T08:00:00Z'), trip('t2', '2026-11-02T09:00:00Z'), trip('t2b', '2026-11-02T15:00:00Z'), trip('t1', '2026-11-01T08:00:00Z')];
    const ofDay = [trip('t2', '2026-11-02T09:00:00Z'), trip('t2b', '2026-11-02T15:00:00Z')];
    const journal = [track('trk__t1', '2026-11-01T08:00:00Z'), track('trk__other', '2026-10-30T08:00:00Z'), track('trk__newer', '2026-11-05T08:00:00Z')];
    const items = trackPickItems(mine, ofDay, journal);
    expect(items.map((i) => i.key)).toEqual(['trk__t2b', 'trk__t2', 'trk__t3', 'trk__t1', 'trk__newer', 'trk__other']);
    expect(items.find((i) => i.key === 'trk__t1')?.inJournal).toBe(true);
    expect(items.find((i) => i.key === 'trk__t3')?.inJournal).toBe(false);
    expect(items.find((i) => i.key === 'trk__other')).toMatchObject({ inJournal: true, tripKey: 'other', name: 'Track trk__other', distanceM: 42 });
  });

  it('sums the distance and lists the modes in order of first appearance', () => {
    const [item] = trackPickItems([trip('t1', '2026-11-01T08:00:00Z')], [], []);
    expect(item).toMatchObject({ key: 'trk__t1', tripKey: 't1', name: 'Trip t1', distanceM: 3500, modes: ['foot', 'train'] });
  });

  it('leaves out trips without recorded sections; offline only the journal’s tracks are listed', () => {
    const empty = trip('t0', '2026-11-01T08:00:00Z');
    (empty.track as NonNullable<TripModel['track']>).sections = [];
    expect(trackPickItems([empty, { ...empty, okey: 'nt', track: undefined } as TripModel], [], [])).toEqual([]);
    expect(trackPickItems([], [], [track('trk__a', '2026-11-01T08:00:00Z')]).map((i) => i.key)).toEqual(['trk__a']);
  });
});

describe('trackPhotoPlan', () => {
  const photo = (assetId: string, over: Record<string, unknown> = {}) =>
    ({ assetId, takenAt: '2026-11-01T09:00:00Z', lat: 47, lng: 8, ownGps: true, hidden: false, ...over });

  it('reuses photos the journal has (by recorded image key or by PhotoKit id) and imports the rest once; hidden ones never', () => {
    const t = trip('t1', '2026-11-01T08:00:00Z');
    (t.track as NonNullable<TripModel['track']>).photos = [
      photo('A1', { imageKey: 'img-1' }), // recorded image key, present
      photo('A2', { imageKey: 'img-gone' }), // recorded key not in this journal, but the photo was imported here before
      photo('A3'), // new
      photo('A3'), // duplicate
      photo('A4', { hidden: true }),
      photo('A5', { imageKey: 'img-gone-too' }), // recorded key elsewhere, not here: import
    ] as never;
    const images = [image('img-1'), image('img-2', { localIdentifier: 'A2' }), image('clip', { localIdentifier: 'A3', videoPath: 'x.mp4' })];
    const plan = trackPhotoPlan(t, images);
    expect(plan.keys).toEqual({ A1: 'img-1', A2: 'img-2' });
    expect(plan.toImport.map((p) => p.assetId)).toEqual(['A3', 'A5']);
  });
});

describe('boundsOf', () => {
  it('is the box around the finite points, undefined without one', () => {
    expect(boundsOf([{ lat: 47, lng: 8 }, { lat: 46, lng: 9 }, { lat: Number.NaN, lng: 0 }])).toEqual([8, 46, 9, 47]);
    expect(boundsOf([])).toBeUndefined();
  });
});

describe('trackTileSources (ruling R4)', () => {
  const swiss = { urlTemplate: 'https://wmts.geo.admin.ch/{z}/{x}/{y}.jpeg', maxNativeZoom: 18, attribution: 'swisstopo' };
  const local = { urlTemplate: 'file:///tiles/gibs/{z}/{x}/{y}.jpg', maxNativeZoom: 4, attribution: 'NASA' };
  const vector = { urlTemplate: 'file:///tiles/osm/{z}/{x}/{y}.mvt', maxNativeZoom: 14, attribution: 'OSM', kind: 'vector' as const };
  const options: BaseLayerOption[] = [
    { id: 'google-roadmap', kind: 'google', googleType: 'roadmap', sources: [{ urlTemplate: 'https://tile.googleapis.com/{z}', maxNativeZoom: 22, attribution: '' }] },
    { id: 'swisstopo-live', kind: 'live', sources: [GIBS_BLUE_MARBLE, swiss] },
    { id: 'offline-osm', kind: 'offline', sources: [local, vector] },
    { id: 'offline-satellite', kind: 'offline', sources: [local] },
    { id: 'world', kind: 'background', sources: [GIBS_BLUE_MARBLE] },
  ];

  it('passes a raster, non-Google selection as it is', () => {
    expect(trackTileSources(options, 'swisstopo-live', true)).toEqual([GIBS_BLUE_MARBLE, swiss]);
    expect(trackTileSources(options, 'offline-satellite', false)).toEqual([local]);
  });

  it('passes nothing for Google or a vector layer online (the track map falls back to swisstopo)', () => {
    expect(trackTileSources(options, 'google-roadmap', true)).toBeUndefined();
    expect(trackTileSources(options, 'offline-osm', true)).toBeUndefined();
    expect(trackTileSources(options, 'unknown', true)).toBeUndefined();
  });

  it('offline it takes the first raster layer instead, never Google or vector tiles', () => {
    const offline = options.filter((o) => o.kind !== 'live' && o.kind !== 'google'); // what an offline iPad is offered
    expect(trackTileSources(offline, 'offline-osm', false)).toEqual([local]);
    expect(trackTileSources(offline, 'google-roadmap', false)).toEqual([local]); // a stored Google choice
    expect(trackTileSources([options[2]], 'offline-osm', false)).toBeUndefined(); // no raster layer at all
  });
});
