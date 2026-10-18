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
  it('leaves out images without a thumbnail and keeps the tapped index aligned', () => {
    const f = (name: string, thumbnailLink: string) => ({ id: name, name, mimeType: 'image/jpeg', thumbnailLink, webViewLink: '' });
    const { images, startIndex } = diarySliderImages([f('a', 'https://x/a=s220'), f('b', ''), f('c', 'https://x/c=s220')], 2);
    expect(images.map(i => i.url)).toEqual(['https://x/a=s2400', 'https://x/c=s2400']);
    expect(startIndex).toBe(1);
  });
});
