import { describe, expect, it } from 'vitest';
import type { TripModel } from '@okr/shared-models';
import type { LocalTrack } from './track-local.model';
import type { LocalSection } from './track-sections.util';
import {
  buildGpx, correctedTrack, elapsedSeconds, isShareCancel, sameTrackContent, fromLocalSections, gpxFileName, localFromTrip, mergeTrackLists, middlePointIndex, sectionRows, toLocalSections,
} from './track-pages.util';

function local(key: string, startedAt: number, extra: Partial<LocalTrack> = {}): LocalTrack {
  return { key, state: 'done', uploaded: false, name: key, startedAt, sections: [{ mode: 'foot', detected: true }], ...extra };
}

function trip(okey: string, startedAt: string, distances: number[] = [1000]): TripModel {
  return {
    okey, tenants: ['bkg'], name: okey, type: 'tracker',
    track: {
      personKey: 'p1', ownerUid: 'u1', startedAt, endedAt: startedAt, durationS: 60, photos: [],
      sections: distances.map((d, i) => ({ mode: i === 0 ? 'bike' : 'foot', detected: i === 0, startedAt, endedAt: startedAt, distanceM: d, pointsPath: `trips/${okey}/track-points/${i}` })),
    },
  } as unknown as TripModel;
}

const P = (lat: number, lng: number, t: number) => ({ lat, lng, t });

describe('mergeTrackLists', () => {
  it('lists local tracks that still need an upload first, then the rest newest first', () => {
    const items = mergeTrackLists(
      [local('a', 1000), local('b', 5000, { uploaded: true })],
      [trip('c', new Date(3000).toISOString()), trip('b', new Date(5000).toISOString())],
    );
    expect(items.map((i) => i.key)).toEqual(['a', 'b', 'c']);
    expect(items[0]).toMatchObject({ needsUpload: true, uploaded: false, local: true });
    expect(items[1]).toMatchObject({ needsUpload: false, uploaded: true, local: true });
    expect(items[2]).toMatchObject({ needsUpload: false, uploaded: true, local: false, distanceM: 1000 });
  });

  it('dedupes by key: an uploaded trip wins over its local copy, even one still marked not uploaded', () => {
    const items = mergeTrackLists([local('a', 1000)], [trip('a', new Date(1000).toISOString(), [500, 700])]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: 'a', needsUpload: false, uploaded: true, local: true, distanceM: 1200 });
  });

  it('leaves out tracks that are still recording or paused', () => {
    const items = mergeTrackLists([local('r', 1, { state: 'recording' }), local('p', 2, { state: 'paused' })], []);
    expect(items).toEqual([]);
  });
});

describe('localFromTrip', () => {
  it('builds a done, uploaded local track and its sections from a trip and its points', () => {
    const t = trip('k', '2026-10-25T08:00:00.000Z', [10, 20]);
    const { track, sections } = localFromTrip(t, [[P(1, 1, 1)], [P(2, 2, 2)]]);
    expect(track).toEqual({
      key: 'k', state: 'done', uploaded: true, name: 'k',
      startedAt: Date.parse('2026-10-25T08:00:00.000Z'), endedAt: Date.parse('2026-10-25T08:00:00.000Z'),
      sections: [{ mode: 'bike', detected: true }, { mode: 'foot', detected: false }],
    });
    expect(sections).toEqual([{ mode: 'bike', detected: true, points: [P(1, 1, 1)] }, { mode: 'foot', detected: false, points: [P(2, 2, 2)] }]);
  });

  it('fills a missing points group with an empty one', () => {
    const { sections } = localFromTrip(trip('k', '2026-10-25T08:00:00.000Z', [10, 20]), [[P(1, 1, 1)]]);
    expect(sections[1].points).toEqual([]);
  });
});

describe('toLocalSections / fromLocalSections', () => {
  it('round-trips a track and its points', () => {
    const t = local('a', 1, { sections: [{ mode: 'foot', detected: true }, { mode: 'bus', detected: false }] });
    const s = toLocalSections(t, [[P(1, 1, 1)]]);
    expect(s).toEqual([{ mode: 'foot', detected: true, points: [P(1, 1, 1)] }, { mode: 'bus', detected: false, points: [] }]);
    const back = fromLocalSections(t, s);
    expect(back.track.sections).toEqual(t.sections);
    expect(back.points).toEqual([[P(1, 1, 1)], []]);
  });

  it('takes the section metadata from the corrected sections', () => {
    const t = local('a', 1);
    const back = fromLocalSections(t, [{ mode: 'car', detected: false, points: [] }, { mode: 'foot', detected: false, points: [] }]);
    expect(back.track.sections).toEqual([{ mode: 'car', detected: false }, { mode: 'foot', detected: false }]);
    expect(back.track.key).toBe('a');
  });
});

describe('sectionRows', () => {
  it('summarizes each section', () => {
    const rows = sectionRows([{ mode: 'foot', detected: true, points: [P(47, 8, 0), P(47.001, 8, 60000)] }]);
    expect(rows[0].mode).toBe('foot');
    expect(rows[0].detected).toBe(true);
    expect(rows[0].durationS).toBe(60);
    expect(Math.round(rows[0].distanceM)).toBe(111);
  });
});

describe('middlePointIndex', () => {
  it('picks an inner point', () => {
    expect(middlePointIndex(3)).toBe(1);
    expect(middlePointIndex(4)).toBe(1);
    expect(middlePointIndex(5)).toBe(2);
    expect(middlePointIndex(10)).toBe(4);
  });

  it('returns -1 when there is no inner point', () => {
    expect(middlePointIndex(2)).toBe(-1);
    expect(middlePointIndex(0)).toBe(-1);
  });
});

describe('elapsedSeconds', () => {
  it('counts whole seconds and never goes negative', () => {
    expect(elapsedSeconds(1000, 62500)).toBe(61);
    expect(elapsedSeconds(5000, 1000)).toBe(0);
  });
});

describe('buildGpx', () => {
  const sections: LocalSection[] = [
    { mode: 'foot', detected: true, points: [P(47.1, 8.2, Date.UTC(2026, 9, 25, 8, 0, 0)), P(47.2, 8.3, Date.UTC(2026, 9, 25, 8, 1, 0))] },
    { mode: 'bus', detected: false, points: [P(47.3, 8.4, Date.UTC(2026, 9, 25, 8, 2, 0))] },
  ];

  it('writes GPX 1.1 with one segment per section', () => {
    const gpx = buildGpx('Zürich <> Bern & "zurück"', sections);
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toContain('<gpx version="1.1" creator="okr" xmlns="http://www.topografix.com/GPX/1/1">');
    expect(gpx).toContain('<name>Zürich &lt;&gt; Bern &amp; &quot;zurück&quot;</name>');
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx).toContain('<trkpt lat="47.1000000" lon="8.2000000"><time>2026-10-25T08:00:00.000Z</time></trkpt>');
    expect(gpx).toContain('<type>bus</type>');
    expect(gpx.trimEnd().endsWith('</gpx>')).toBe(true);
  });

  it('never writes exponent notation', () => {
    const gpx = buildGpx('x', [{ mode: 'foot', detected: true, points: [P(0.0000001, -0.00000012, 0)] }]);
    expect(gpx).toContain('<trkpt lat="0.0000001" lon="-0.0000001">');
    expect(gpx).not.toMatch(/e-/);
  });

  it('skips sections without points', () => {
    const gpx = buildGpx('x', [{ mode: 'car', detected: false, points: [] }]);
    expect(gpx).not.toContain('<trkseg>');
  });
});

describe('gpxFileName', () => {
  it('keeps letters and digits and ends in .gpx', () => {
    expect(gpxFileName('Velo 25.10.2026 08:15')).toBe('Velo-25-10-2026-08-15.gpx');
    expect(gpxFileName('Zürich / Bern')).toBe('Zürich-Bern.gpx');
  });

  it('falls back to track.gpx', () => {
    expect(gpxFileName('  //  ')).toBe('track.gpx');
  });
});

describe('sameTrackContent', () => {
  it('is true when name and sections match, whatever else differs', () => {
    expect(sameTrackContent(local('a', 1), local('a', 1, { uploaded: true, endedAt: 9, extraPointsUpTo: 3 }))).toBe(true);
  });

  it('treats a missing rev as 0', () => {
    expect(sameTrackContent(local('a', 1), local('a', 1, { rev: 0 }))).toBe(true);
  });

  it('is false for a newer correction with equal content (rev differs)', () => {
    expect(sameTrackContent(local('a', 1, { rev: 1 }), local('a', 1, { rev: 2 }))).toBe(false);
    expect(sameTrackContent(local('a', 1), local('a', 1, { rev: 1 }))).toBe(false);
  });

  it('is false when the name or a section differs', () => {
    expect(sameTrackContent(local('a', 1), local('a', 1, { name: 'b' }))).toBe(false);
    expect(sameTrackContent(local('a', 1), local('a', 1, { sections: [{ mode: 'foot', detected: false }] }))).toBe(false);
    expect(sameTrackContent(local('a', 1), local('a', 1, { sections: [{ mode: 'foot', detected: true }, { mode: 'bus', detected: false }] }))).toBe(false);
  });
});

describe('correctedTrack', () => {
  const two = local('a', 1, { uploaded: true, sections: [{ mode: 'foot', detected: true }, { mode: 'bus', detected: true }] });

  it('takes the new sections and name and marks the track for upload', () => {
    const t = correctedTrack(two, [{ mode: 'car', detected: false }, { mode: 'bus', detected: true }], 'neu');
    expect(t).toMatchObject({ name: 'neu', uploaded: false, sections: [{ mode: 'car', detected: false }, { mode: 'bus', detected: true }] });
    expect(t.extraPointsUpTo).toBeUndefined();
    expect(t.rev).toBe(1);
  });

  it('counts every correction', () => {
    const once = correctedTrack(two, two.sections);
    expect(correctedTrack(once, once.sections).rev).toBe(2);
  });

  it('remembers the old section count when the track got fewer sections', () => {
    const t = correctedTrack(two, [{ mode: 'foot', detected: false }]);
    expect(t.name).toBe('a');
    expect(t.extraPointsUpTo).toBe(2);
  });

  it('keeps a larger remembered bound', () => {
    expect(correctedTrack({ ...two, extraPointsUpTo: 4 }, [{ mode: 'foot', detected: false }]).extraPointsUpTo).toBe(4);
  });
});

describe('isShareCancel', () => {
  it('recognises the share sheet being closed', () => {
    expect(isShareCancel(new Error('Share canceled'))).toBe(true);
    expect(isShareCancel({ message: 'Share Canceled' })).toBe(true);
    expect(isShareCancel(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('is false for other errors', () => {
    expect(isShareCancel(new Error('disk full'))).toBe(false);
    expect(isShareCancel(undefined)).toBe(false);
  });
});
