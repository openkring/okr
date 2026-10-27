import type { DiaryTrackCard } from './diary-track.util';

/** One visible track photo in the diary day's photo row, after the Drive images. */
export interface DiaryTrackPhotoTile {
  /** `<track key>/<photoIndex>` — stable per photo */
  key: string;
  /** index of the track in the day's cards */
  cardIndex: number;
  /** index into the track's full photo list (hidden ones included), as the track view selects it */
  photoIndex: number;
  takenAt: string;
  /** absent: no thumbnail yet, the tile keeps its placeholder */
  thumbPath?: string;
}

/** The visible photos of the day's tracks, in track order and then photo order; hidden photos never appear. */
export function diaryTrackPhotoTiles(cards: DiaryTrackCard[]): DiaryTrackPhotoTile[] {
  const tiles: DiaryTrackPhotoTile[] = [];
  cards.forEach((card, cardIndex) => {
    card.photos.forEach((photo, photoIndex) => {
      if (photo.hidden) return;
      const tile: DiaryTrackPhotoTile = { key: `${card.key}/${photoIndex}`, cardIndex, photoIndex, takenAt: photo.takenAt };
      if (photo.thumbPath) tile.thumbPath = photo.thumbPath;
      tiles.push(tile);
    });
  });
  return tiles;
}
