import { describe, expect, it } from 'vitest';
import { isVideoFile, isVideoImage, MAX_VIDEO_BYTES, MAX_VIDEO_SEC, MAX_VIDEO_SOURCE_BYTES, MAX_VIDEOS_PER_BLOCK, pendingVideoStats, uploadOrder } from './journal-video.util';
import { ImageView } from './journal-view.util';

const img = (extra: Partial<ImageView> = {}): ImageView => ({ key: 'i', authorKey: 'a', width: 1, height: 1, path2048: '', path400: '', localIdentifier: '', ...extra });

describe('journal video util', () => {
  it('limits', () => {
    expect([MAX_VIDEO_SEC, MAX_VIDEOS_PER_BLOCK, MAX_VIDEO_BYTES, MAX_VIDEO_SOURCE_BYTES]).toEqual([60, 5, 7_800_000, 524_288_000]);
  });

  it('isVideoImage looks at videoPath', () => {
    expect(isVideoImage(img({ videoPath: 'journals/j/n-video.mp4' }))).toBe(true);
    expect(isVideoImage(img())).toBe(false);
    expect(isVideoImage(img({ videoPath: '' }))).toBe(false);
  });

  it('isVideoFile matches -video.mp4 only', () => {
    expect(isVideoFile('n-video.mp4')).toBe(true);
    expect(isVideoFile('n-2048.jpg')).toBe(false);
    expect(isVideoFile('n-video.mp4.jpg')).toBe(false);
  });

  it('uploadOrder puts jpg before mp4 and keeps order within each', () => {
    const input = ['a-video.mp4', 'a-2048.jpg', 'b-video.mp4', 'b-400.jpg'];
    expect(uploadOrder(input)).toEqual(['a-2048.jpg', 'b-400.jpg', 'a-video.mp4', 'b-video.mp4']);
    expect(input[0]).toBe('a-video.mp4');
  });

  it('pendingVideoStats counts published, present, not uploaded mp4s only', () => {
    const rows = [
      { file: 'a-video.mp4', uploaded: false, present: true },
      { file: 'b-video.mp4', uploaded: false, present: true },
      { file: 'c-video.mp4', uploaded: true, present: true },
      { file: 'd-video.mp4', uploaded: false, present: false },
      { file: 'e-video.mp4', uploaded: false, present: true },
      { file: 'a-2048.jpg', uploaded: false, present: true },
    ];
    expect(pendingVideoStats(rows, new Set(['a-video.mp4', 'b-video.mp4', 'c-video.mp4', 'd-video.mp4']), { 'a-video.mp4': 7_000_000 })).toEqual({ count: 2, bytes: 7_000_000 });
  });
});
