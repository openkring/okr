import { describe, expect, it } from 'vitest';
import { FootprintView, ImageView } from './journal-view.util';
import { journalMapData, routeLengthKm } from './journal-map.util';

function footprint(key: string, lat?: number, lng?: number, imageKeys: string[] = []): FootprintView {
  return {
    key, journalKey: 'j1', title: key, placeName: '', date: '', time: '', latitude: lat, longitude: lng, publishState: 'draft',
    blocks: imageKeys.length ? [{ key: `b-${key}`, kind: 'photos', authorKey: 'bruno', order: 'V', imageKeys }] : [],
  };
}
function image(key: string, takenAt: string, lat?: number, lng?: number): ImageView {
  return { key, authorKey: 'bruno', takenAt, latitude: lat, longitude: lng, width: 2048, height: 1536, path2048: `p/${key}-2048.jpg`, path400: `p/${key}-400.jpg`, localIdentifier: key };
}

describe('journal map', () => {
  it('journalMapData skips footprints without position', () => {
    const data = journalMapData([footprint('a'), footprint('b', -64.83, -62.53)], new Map());
    expect(data.pins.map((p) => p.key)).toEqual(['b']);
    expect(data.pins[0]).toMatchObject({ lat: -64.83, lng: -62.53, label: 'b' });
  });

  it('journalMapData takes the first photo as the pin thumbnail', () => {
    const images = new Map([['i1', image('i1', '2027-01-14T09:00:00')], ['i2', image('i2', '2027-01-14T10:00:00')]]);
    const data = journalMapData([footprint('a', -64.8, -62.5, ['i2', 'i1'])], images);
    expect(data.pins[0].imagePath).toBe('p/i2-400.jpg');
  });

  it('journalMapData builds the route from all photo positions in time order', () => {
    const images = new Map([
      ['i1', image('i1', '2027-01-14T09:00:00', -64.8, -62.5)],
      ['i2', image('i2', '2027-01-13T09:00:00', -62.97, -60.65)],
      ['i3', image('i3', '2027-01-13T10:00:00')],
    ]);
    expect(journalMapData([], images).route).toEqual([[-62.97, -60.65], [-64.8, -62.5]]);
  });

  it('routeLengthKm sums the legs', () => {
    expect(routeLengthKm([[-54.8, -68.3], [-62.97, -60.65]])).toBe(1008);
    expect(routeLengthKm([[-54.8, -68.3]])).toBe(0);
    expect(routeLengthKm([])).toBe(0);
  });
});
