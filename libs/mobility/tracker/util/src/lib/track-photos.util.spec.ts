import { describe, expect, it } from 'vitest';
import { LibraryPhoto, placePhotos, positionAt, trackThumbPath, trackTenants, localStoreDate } from './track-photos.util';
import { TrackPoint } from './track-polyline.util';

const P = (t: number, lat: number, lng: number): TrackPoint => ({ t, lat, lng });
const photo = (assetId: string, takenAt: number, lat?: number, lng?: number): LibraryPhoto => ({
  assetId,
  takenAt,
  lat,
  lng,
  path400: `/tmp/${assetId}.jpg`,
});

describe('positionAt', () => {
  const pts = [P(1000, 10, 20), P(2000, 12, 24)];
  it('interpolates halfway', () => expect(positionAt(pts, 1500)).toEqual({ lat: 11, lng: 22 }));
  it('clamps before the first point', () => expect(positionAt(pts, 0)).toEqual({ lat: 10, lng: 20 }));
  it('clamps after the last point', () => expect(positionAt(pts, 9999)).toEqual({ lat: 12, lng: 24 }));
  it('returns undefined for no points', () => expect(positionAt([], 5)).toBeUndefined());
});

describe('placePhotos', () => {
  const sections = [[P(1000, 10, 20)], [P(2000, 12, 24)]];
  it('keeps own GPS, interpolates otherwise, filters and sorts', () => {
    const out = placePhotos(
      [photo('c', 5000), photo('b', 1500), photo('a', 1200, 1, 2), photo('d', 1100)],
      sections,
      1000,
      2000,
    );
    expect(out.map((p) => p.assetId)).toEqual(['d', 'a', 'b']);
    expect(out[1]).toMatchObject({ lat: 1, lng: 2, ownGps: true, hidden: false, path400: '/tmp/a.jpg' });
    expect(out[2]).toMatchObject({ lat: 11, lng: 22, ownGps: false, hidden: false });
    expect(out[0].takenAt).toBe(new Date(1100).toISOString());
  });
  it('drops photos that cannot be placed', () => {
    expect(placePhotos([photo('a', 1500)], [], 1000, 2000)).toEqual([]);
  });
});

describe('trackTenants', () => {
  it('adds matching targets after own, deduplicated', () => {
    const t = (tenantId: string, sources: ('tracker' | 'tripDone')[], to = '') => ({ tenantId, sources, from: '', to });
    expect(trackTenants('bkg', [t('bka', ['tracker'])], '20261026')).toEqual(['bkg', 'bka']);
    expect(trackTenants('bkg', [t('bka', ['tracker'], '20261001')], '20261026')).toEqual(['bkg']);
    expect(trackTenants('bkg', [t('bka', ['tripDone'])], '20261026')).toEqual(['bkg']);
    expect(trackTenants('bkg', [t('bkg', ['tracker']), t('bka', ['tracker']), t('bka', ['tracker'])], '20261026')).toEqual(['bkg', 'bka']);
    expect(trackTenants('bkg', undefined, '20261026')).toEqual(['bkg']);
  });
});

describe('trackThumbPath', () => {
  it('builds the private bucket path', () => expect(trackThumbPath('bkg', 'k1', 2)).toBe('tenant/bkg/tracks/k1/2.jpg'));
});

describe('localStoreDate', () => {
  it('formats the local day', () => expect(localStoreDate(new Date(2026, 9, 5, 23, 59).getTime())).toBe('20261005'));
});
