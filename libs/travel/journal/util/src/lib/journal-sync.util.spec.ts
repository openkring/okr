import { describe, expect, it } from 'vitest';
import {
  advanceCursor, allPhotoFiles, classifyUploadError, CURSOR_OVERLAP_MS, downloadStart, pagesOf, parsePhotoMode, photoFileName, publishedPhotoFiles,
  remoteChangeOf, retryWithBackoff,
} from './journal-sync.util';
import { formatHlc } from './journal-hlc.util';
import { FootprintView, ImageView } from './journal-view.util';

const image = (key: string): ImageView => ({
  key, authorKey: 'bruno', width: 1, height: 1, path2048: `journals/j1/${key}-2048.jpg`, path400: `journals/j1/${key}-400.jpg`, localIdentifier: '',
});
const footprint = (key: string, publishState: 'draft' | 'published', imageKeys: string[]): FootprintView => ({
  key, journalKey: 'j1', title: '', placeName: '', date: '', time: '', publishState, hlcs: {}, lostValues: [],
  blocks: [{ key: `b-${key}`, kind: 'photos', authorKey: 'bruno', order: 'V', imageKeys, hlcs: {}, conflict: false }],
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

describe('retryWithBackoff', () => {
  it('tries up to three times, waiting 2 s and 4 s, and returns the first success', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await retryWithBackoff(async () => {
      calls++;
      if (calls < 3) throw new Error('resource-exhausted');
      return 'links';
    }, 3, 2000, async (ms) => { waits.push(ms); });
    expect(result).toBe('links');
    expect(calls).toBe(3);
    expect(waits).toEqual([2000, 4000]);
  });

  it('throws the last error after the last try', async () => {
    let calls = 0;
    await expect(retryWithBackoff(async () => { calls++; throw new Error(`fail ${calls}`); }, 3, 1, async () => undefined)).rejects.toThrow('fail 3');
    expect(calls).toBe(3);
  });
});

describe('remoteChangeOf', () => {
  const data = (wall: number, extra: Record<string, unknown> = {}) => ({
    id: 'r1', journalKey: 'j1', deviceId: 'dev-a', seq: 1, hlc: formatHlc({ wall, counter: 0, deviceId: 'dev-a' }), authorKey: 'bruno',
    entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'x' }, tenants: ['bkg'], uploadedAt: { seconds: 1 }, ...extra,
  });

  it('a stored record becomes a change without the server fields', () => {
    const change = remoteChangeOf(data(1000), 2000);
    expect(change).toEqual({ id: 'r1', journalKey: 'j1', deviceId: 'dev-a', seq: 1, hlc: formatHlc({ wall: 1000, counter: 0, deviceId: 'dev-a' }),
      authorKey: 'bruno', entity: 'footprint', entityKey: 'f1', op: 'set', fields: { title: 'x' } });
  });

  it('a record whose clock lies more than a day after its upload is dropped', () => {
    expect(remoteChangeOf(data(2000 + 25 * 60 * 60 * 1000), 2000)).toBeUndefined();
  });

  it('a malformed hlc is dropped', () => {
    expect(remoteChangeOf(data(1000, { hlc: 'nonsense' }), 2000)).toBeUndefined();
  });
});
