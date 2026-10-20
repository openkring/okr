import { describe, expect, it } from 'vitest';

import { diaryFileIconName, diarySliderImages, driveThumbnailAtSize } from './diary-media.util';

describe('driveThumbnailAtSize', () => {
  it('replaces the size suffix', () => {
    expect(driveThumbnailAtSize('https://lh3.googleusercontent.com/x=s220', 2400)).toBe('https://lh3.googleusercontent.com/x=s2400');
  });
  it('appends a size when there is none', () => {
    expect(driveThumbnailAtSize('https://lh3.googleusercontent.com/x', 400)).toBe('https://lh3.googleusercontent.com/x=s400');
  });
  it('keeps an empty link empty', () => {
    expect(driveThumbnailAtSize('', 400)).toBe('');
  });
});

describe('diaryFileIconName', () => {
  it('names the file type of a pdf', () => expect(diaryFileIconName('application/pdf')).toBe('pdf'));
  it('falls back to a generic file', () => expect(diaryFileIconName('')).toBe('file'));
});

describe('diarySliderImages', () => {
  const f = (name: string, thumbnail: string) => ({ id: name, name, mimeType: 'image/jpeg', thumbnail, webViewLink: '' });

  it('leaves out images without a thumbnail and keeps the tapped index aligned', () => {
    const { images, startIndex } = diarySliderImages([f('a', 'data:a'), f('b', ''), f('c', 'data:c')], 2);
    expect(images.map(i => i.url)).toEqual(['data:a', 'data:c']);
    expect(startIndex).toBe(1);
  });

  it('leaves out videos', () => {
    const video = { ...f('v', 'data:v'), mimeType: 'video/mp4' };
    const { images, startIndex } = diarySliderImages([f('a', 'data:a'), video, f('c', 'data:c')], 2);
    expect(images.map(i => i.url)).toEqual(['data:a', 'data:c']);
    expect(startIndex).toBe(1);
  });

  it('prefers the large rendition where one is loaded', () => {
    const { images } = diarySliderImages([f('a', 'data:a'), f('c', 'data:c')], 0, new Map([['c', 'data:C-large']]));
    expect(images.map(i => i.url)).toEqual(['data:a', 'data:C-large']);
  });
});
