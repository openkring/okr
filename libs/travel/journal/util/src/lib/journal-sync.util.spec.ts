import { describe, expect, it } from 'vitest';
import {
  advanceCursor, allPhotoFiles, classifyUploadError, CURSOR_OVERLAP_MS, downloadStart, pagesOf, parsePhotoMode, photoFileName, publishedPhotoFiles,
} from './journal-sync.util';
import { FootprintView, ImageView } from './journal-view.util';

const image = (key: string): ImageView => ({
  key, authorKey: 'bruno', width: 1, height: 1, path2048: `journals/j1/${key}-2048.jpg`, path400: `journals/j1/${key}-400.jpg`, localIdentifier: '',
});
const footprint = (key: string, publishState: 'draft' | 'published', imageKeys: string[]): FootprintView => ({
  key, journalKey: 'j1', title: '', placeName: '', date: '', time: '', publishState,
  blocks: [{ key: `b-${key}`, kind: 'photos', authorKey: 'bruno', order: 'V', imageKeys }],
});

describe('journal sync util', () => {
  it('pages of 200 keep record order', () => {
    const records = Array.from({ length: 450 }, (_, i) => i);
    const pages = pagesOf(records, 200);
    expect(pages.map((p) => p.length)).toEqual([200, 200, 50]);
    expect(pages.flat()).toEqual(records);
  });

  it('an existing record counts as uploaded', () => {
    expect(classifyUploadError('permission-denied', true)).toBe('uploaded');
    expect(classifyUploadError('permission-denied', false)).toBe('stop');
    expect(classifyUploadError('unavailable', false)).toBe('retry');
  });

  it('cursor advances only past stored pages', () => {
    expect(advanceCursor(undefined, [])).toBeUndefined();
    expect(advanceCursor(5000, [7000, 6000])).toBe(7000);
    expect(advanceCursor(9000, [7000])).toBe(9000); // never back
  });

  it('downloads overlap the cursor by a minute', () => {
    expect(downloadStart(undefined)).toBe(0);
    expect(downloadStart(1_000_000)).toBe(1_000_000 - CURSOR_OVERLAP_MS);
    expect(downloadStart(10)).toBe(0);
  });

  it('only photos of published footprints are uploaded', () => {
    const images = new Map([['a', image('a')], ['b', image('b')]]);
    const files = publishedPhotoFiles([footprint('f1', 'published', ['a', 'missing']), footprint('f2', 'draft', ['b'])], images);
    expect(files).toEqual(['a-2048.jpg', 'a-400.jpg']);
    expect(allPhotoFiles(images)).toEqual(['a-2048.jpg', 'a-400.jpg', 'b-2048.jpg', 'b-400.jpg']);
    expect(photoFileName('journals/j1/x.jpg')).toBe('x.jpg');
  });

  it('photo mode: stored value, else the old pause flag, else all', () => {
    expect(parsePhotoMode('uploadOnly', undefined)).toBe('uploadOnly');
    expect(parsePhotoMode(undefined, '1')).toBe('paused');
    expect(parsePhotoMode(undefined, '0')).toBe('all');
    expect(parsePhotoMode('nonsense', undefined)).toBe('all');
  });
});
