import { describe, expect, it } from 'vitest';
import { NewsChannelModel } from '@okr/shared-models';
import { NEWS_MAP_KEY, webcamMarkers } from './news-map.util';

const cam = (patch: Partial<NewsChannelModel>): NewsChannelModel => ({ okey: 'c', name: 'Cam', segment: 'webcam', latitude: 0, longitude: 0, ...patch } as NewsChannelModel);

describe('webcamMarkers', () => {
  it('is keyed by the map entry value', () => {
    expect(NEWS_MAP_KEY).toBe('map');
  });
  it('skips cameras without a position', () => {
    expect(webcamMarkers([cam({ okey: 'a' }), cam({ okey: 'b', latitude: NaN, longitude: 8 })], {})).toEqual([]);
  });
  it('maps a placed camera to a marker with its still', () => {
    const markers = webcamMarkers([cam({ okey: 'a', name: 'Hafen', latitude: 47.23, longitude: 8.72 })], { a: 'https://cam/a.jpg' });
    expect(markers).toEqual([{ id: 'a', title: 'Hafen', lat: 47.23, lng: 8.72, imageUrl: 'https://cam/a.jpg' }]);
  });
  it("uses '' when a placed camera has no still yet", () => {
    expect(webcamMarkers([cam({ okey: 'a', latitude: 46.6, longitude: 8.8 })], {})[0].imageUrl).toBe('');
  });
});
