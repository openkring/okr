import { describe, expect, it } from 'vitest';

import type { DiaryTrackCard } from './diary-track.util';
import { diaryTrackPhotoTiles } from './diary-track-photo.util';

function card(key: string, photos: DiaryTrackCard['photos']): DiaryTrackCard {
  return { key, name: key, startDate: '20261027', startTime: '08:00', modes: [], distanceM: 0, durationS: 0, sections: [], photos };
}

const photo = (takenAt: string, hidden = false, thumbPath?: string): DiaryTrackCard['photos'][number] =>
  ({ lat: 47, lng: 8, hidden, takenAt, ...(thumbPath ? { thumbPath } : {}) });

describe('diaryTrackPhotoTiles', () => {
  it('returns no tiles without tracks or photos', () => {
    expect(diaryTrackPhotoTiles([])).toEqual([]);
    expect(diaryTrackPhotoTiles([card('a', [])])).toEqual([]);
  });

  it('lists the visible photos in track order, then photo order', () => {
    const tiles = diaryTrackPhotoTiles([
      card('a', [photo('2026-10-27T08:10:00Z', false, 'a/1.jpg'), photo('2026-10-27T08:20:00Z', false, 'a/2.jpg')]),
      card('b', [photo('2026-10-27T15:00:00Z', false, 'b/1.jpg')]),
    ]);
    expect(tiles.map(t => t.key)).toEqual(['a/0', 'a/1', 'b/0']);
    expect(tiles.map(t => t.thumbPath)).toEqual(['a/1.jpg', 'a/2.jpg', 'b/1.jpg']);
    expect(tiles[2]).toMatchObject({ cardIndex: 1, photoIndex: 0, takenAt: '2026-10-27T15:00:00Z' });
  });

  it('leaves hidden photos out but keeps the photo index into the full list', () => {
    const tiles = diaryTrackPhotoTiles([card('a', [photo('t1', true, 'a/1.jpg'), photo('t2', false, 'a/2.jpg')])]);
    expect(tiles).toEqual([{ key: 'a/1', cardIndex: 0, photoIndex: 1, takenAt: 't2', thumbPath: 'a/2.jpg' }]);
  });

  it('keeps a photo without thumbnail (placeholder tile)', () => {
    const tiles = diaryTrackPhotoTiles([card('a', [photo('t1')])]);
    expect(tiles).toEqual([{ key: 'a/0', cardIndex: 0, photoIndex: 0, takenAt: 't1' }]);
  });
});
