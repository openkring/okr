import { describe, expect, it } from 'vitest';
import {
  chunk, joinCommentTexts, mergeUploadHeaders, publicRoomUrl, ratingData, ratingId, shapeSaveRequest, shapeUploadRequest, sortByTitle,
} from './learning-request';

describe('learning-request', () => {
  it('chunks into groups of 30', () => {
    const keys = Array.from({ length: 65 }, (_, i) => `k${i}`);
    expect(chunk(keys).map(c => c.length)).toEqual([30, 30, 5]);
    expect(chunk([])).toEqual([]);
  });

  it('drops undefined fields from a save request', () => {
    expect(shapeSaveRequest({ pageKey: 'p', docKey: 'd', title: undefined, notes: '' }))
      .toEqual({ pageKey: 'p', docKey: 'd', notes: '' });
  });

  it('shapes the upload request from the file', () => {
    expect(shapeUploadRequest('p', 'T', { name: 'a.mp4', type: 'video/mp4', size: 5 }))
      .toEqual({ pageKey: 'p', topic: 'T', fileName: 'a.mp4', contentType: 'video/mp4', size: 5 });
  });

  it('keeps server headers verbatim and adds Content-Type only when missing', () => {
    const h = { 'x-goog-content-length-range': '0,5', 'x-goog-meta-firebaseStorageDownloadTokens': 't' };
    expect(mergeUploadHeaders(h, 'image/png')).toEqual({ ...h, 'Content-Type': 'image/png' });
    expect(mergeUploadHeaders({ 'content-type': 'a/b' }, 'image/png')).toEqual({ 'content-type': 'a/b' });
    expect(mergeUploadHeaders(undefined, 'x/y')).toEqual({ 'Content-Type': 'x/y' });
    expect(h).not.toHaveProperty('Content-Type');
  });

  it('joins comment texts per document, skipping archived and foreign parents', () => {
    expect(joinCommentTexts([
      { parentKey: 'document.a', description: 'one' },
      { parentKey: 'document.a', description: 'two' },
      { parentKey: 'document.b', description: 'x', isArchived: true },
      { parentKey: 'person.c', description: 'y' },
      { parentKey: 'document.d', description: '' },
    ])).toEqual({ a: 'one\ntwo' });
  });

  it('sorts by title', () => {
    expect(sortByTitle([{ title: 'b' }, { title: 'A' }, {}]).map(d => d.title ?? '')).toEqual(['', 'A', 'b']);
  });

  it('builds the public page url', () => {
    expect(publicRoomUrl('proj', 'my page', 'scs'))
      .toBe('https://europe-west6-proj.cloudfunctions.net/publicApi/public/api/v1/pages/my%20page?tenantId=scs');
  });

  it('builds rating ids and exactly the whitelisted rating fields', () => {
    expect(ratingId('d1', 'p1')).toBe('d1__p1');
    const data = ratingData('scs', 'd1', 'p1', 4, new Date('2026-10-22T10:00:00Z'));
    expect(Object.keys(data).sort()).toEqual(['isArchived', 'parentKey', 'personKey', 'stars', 'tenants', 'updatedAt']);
    expect(data).toMatchObject({ parentKey: 'document.d1', tenants: ['scs'], stars: 4, isArchived: false });
  });
});
