import { describe, expect, it } from 'vitest';

import type { DocumentModel, LearningConfig, Roles } from '@okr/shared-models';
import type { LearningActor } from '@okr/content-learning-util';
import { MAX_VIDEO_BYTES } from '@okr/shared-util-core';

import {
  assertDocInRoom, assertLearningPage, decideDelete, decideSave, decideUpload, groupKeyCandidate, learningSectionKeys,
  learningUploadPath, LEARNING_FILE_MAX_BYTES, parseDeleteRequest, parseSaveRequest, parseUploadRequest, pickLearningConfig,
} from './learning-auth';

// Spec 1.115 part 2 — the curator callables are thin; every decision lives in these pure helpers.

const T = 'scs';
const config: LearningConfig = {
  folder: 'f1', topics: 'knoten, wetter, recht', defaultTab: 'videos',
  curators: [{ tag: 'knoten', personKeys: ['p1'] }, { tag: 'wetter', personKeys: ['p1', 'p2'] }],
};
const actor = (personKey: string, roles: Roles = {}, isGroupAdmin = false): LearningActor => ({ personKey, roles, isGroupAdmin });
const curator = actor('p1');
const member = actor('p9');
const admin = actor('a', { admin: true });
const doc = (over: Partial<DocumentModel> = {}): Partial<DocumentModel> => ({
  tenants: [T], isArchived: false, folderKeys: ['f1'], tags: 'knoten', authorKey: 'p1', ...over,
});
const identity = (s: string) => s;
const TODAY = '20261023';

function codeOf(fn: () => unknown): string {
  try { fn(); } catch (e) { return (e as { code?: string }).code ?? 'thrown'; }
  return 'none';
}

describe('room resolution', () => {
  it('derives the group key candidate from <groupKey>_learning', () => {
    expect(groupKeyCandidate('g1_learning')).toBe('g1');
    expect(groupKeyCandidate('abc_def_learning')).toBe('abc_def');
    expect(groupKeyCandidate('_learning')).toBe('');
    expect(groupKeyCandidate('rudern')).toBe('');
    expect(groupKeyCandidate('g1_learning_x')).toBe('');
  });
  it('replaces @TID@ in section keys and drops unsafe ids', () => {
    expect(learningSectionKeys(['@TID@_learn', 'plain', 'a/b', ''], T)).toEqual(['scs_learn', 'plain']);
    expect(learningSectionKeys(undefined, T)).toEqual([]);
  });
  it('picks the first learning section of the tenant, in page order', () => {
    const other = { type: 'learning', tenants: ['x'], properties: { ...config, folder: 'fx' } };
    const mine = { type: 'learning', tenants: [T], properties: config };
    const later = { type: 'learning', tenants: [T], properties: { ...config, folder: 'f2' } };
    expect(pickLearningConfig([undefined, { type: 'article', tenants: [T] }, other, mine, later], T)?.folder).toBe('f1');
    expect(pickLearningConfig([{ type: 'article', tenants: [T] }], T)).toBeUndefined();
  });
  it('ignores a learning section without a safe folder key', () => {
    expect(pickLearningConfig([{ type: 'learning', tenants: [T], properties: { ...config, folder: '' } }], T)).toBeUndefined();
    expect(pickLearningConfig([{ type: 'learning', tenants: [T], properties: { ...config, folder: 'a/b' } }], T)).toBeUndefined();
  });
  it('accepts only a live learning page of the tenant', () => {
    expect(codeOf(() => assertLearningPage({ tenants: [T], type: 'learning', isArchived: false }, T))).toBe('none');
    expect(codeOf(() => assertLearningPage(undefined, T))).toBe('not-found');
    expect(codeOf(() => assertLearningPage({ tenants: ['x'], type: 'learning' }, T))).toBe('not-found');
    expect(codeOf(() => assertLearningPage({ tenants: [T], type: 'learning', isArchived: true }, T))).toBe('not-found');
    expect(codeOf(() => assertLearningPage({ tenants: [T], type: 'content' }, T))).toBe('failed-precondition');
  });
});

describe('assertDocInRoom', () => {
  it('requires tenant, not archived and the room folder', () => {
    expect(codeOf(() => assertDocInRoom(doc(), config, T))).toBe('none');
    expect(codeOf(() => assertDocInRoom(undefined, config, T))).toBe('not-found');
    expect(codeOf(() => assertDocInRoom(doc({ tenants: ['x'] }), config, T))).toBe('not-found');
    expect(codeOf(() => assertDocInRoom(doc({ isArchived: true }), config, T))).toBe('not-found');
    expect(codeOf(() => assertDocInRoom(doc({ folderKeys: ['other'] }), config, T))).toBe('permission-denied');
    expect(codeOf(() => assertDocInRoom(doc({ folderKeys: undefined }), config, T))).toBe('permission-denied');
  });
});

describe('parseSaveRequest', () => {
  it('keeps only provided fields', () => {
    expect(parseSaveRequest({ pageKey: 'p', docKey: 'd', title: ' T ' })).toEqual({ pageKey: 'p', docKey: 'd', title: 'T' });
  });
  it('rejects bad keys and bad field types', () => {
    expect(codeOf(() => parseSaveRequest({ pageKey: 'a/b', docKey: 'd' }))).toBe('invalid-argument');
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: '' }))).toBe('invalid-argument');
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', notes: 5 }))).toBe('invalid-argument');
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', links: 'x' }))).toBe('invalid-argument');
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', attachmentKeys: ['a/b'] }))).toBe('invalid-argument');
  });
  it('rejects an empty or too long title', () => {
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', title: '  ' }))).toBe('invalid-argument');
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', title: 'x'.repeat(201) }))).toBe('invalid-argument');
  });
  it('accepts https links only, at most 20, titles 1..100', () => {
    const ok = { title: 'SRV', url: 'https://swissrowing.ch/x' };
    expect(parseSaveRequest({ pageKey: 'p', docKey: 'd', links: [{ ...ok, extra: 1 }] }).links).toEqual([ok]);
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', links: [{ title: 'x', url: 'http://a.ch' }] }))).toBe('invalid-argument');
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', links: [{ title: 'x', url: 'javascript:alert(1)' }] }))).toBe('invalid-argument');
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', links: [{ title: '', url: ok.url }] }))).toBe('invalid-argument');
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', links: [{ title: 'x'.repeat(101), url: ok.url }] }))).toBe('invalid-argument');
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', links: Array(21).fill(ok) }))).toBe('invalid-argument');
  });
  it('de-duplicates attachment keys, at most 20, never the doc itself', () => {
    expect(parseSaveRequest({ pageKey: 'p', docKey: 'd', attachmentKeys: ['a', 'a', 'b'] }).attachmentKeys).toEqual(['a', 'b']);
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', attachmentKeys: ['d'] }))).toBe('invalid-argument');
    expect(codeOf(() => parseSaveRequest({ pageKey: 'p', docKey: 'd', attachmentKeys: Array.from({ length: 21 }, (_, i) => `k${i}`) }))).toBe('invalid-argument');
  });
});

describe('decideSave', () => {
  const req = (over: object) => ({ pageKey: 'p', docKey: 'd', ...over });
  it('curator edits notes/links/title/attachments of a curated item', () => {
    const patch = decideSave(config, curator, doc(), req({ title: 'Neu', notes: '<p>x</p>', links: [], attachmentKeys: ['a'] }), identity, TODAY);
    expect(patch).toEqual({ title: 'Neu', notes: '<p>x</p>', links: [], attachmentKeys: ['a'], dateOfDocLastUpdate: TODAY });
  });
  it('a member cannot edit; a curator cannot edit a foreign topic', () => {
    expect(codeOf(() => decideSave(config, member, doc(), req({ notes: 'x' }), identity, TODAY))).toBe('permission-denied');
    expect(codeOf(() => decideSave(config, curator, doc({ tags: 'recht' }), req({ title: 'x' }), identity, TODAY))).toBe('permission-denied');
  });
  it('tags go through canChangeTags and are normalised', () => {
    expect(decideSave(config, curator, doc(), req({ tags: 'knoten, wetter,  misc ' }), identity, TODAY).tags).toBe('knoten,wetter,misc');
    expect(codeOf(() => decideSave(config, curator, doc(), req({ tags: 'knoten, recht' }), identity, TODAY))).toBe('permission-denied');
    expect(codeOf(() => decideSave(config, curator, doc({ tags: 'knoten, recht' }), req({ tags: 'knoten' }), identity, TODAY))).toBe('permission-denied');
    expect(decideSave(config, admin, doc({ tags: 'recht' }), req({ tags: 'wetter' }), identity, TODAY).tags).toBe('wetter');
  });
  it('sanitises notes and caps them after sanitising', () => {
    const strip = (s: string) => s.replace(/<script>.*<\/script>/g, '');
    expect(decideSave(config, curator, doc(), req({ notes: '<p>a</p><script>x</script>' }), strip, TODAY).notes).toBe('<p>a</p>');
    const big = 'x'.repeat(20001);
    expect(codeOf(() => decideSave(config, curator, doc(), req({ notes: big }), identity, TODAY))).toBe('invalid-argument');
    expect(decideSave(config, curator, doc(), req({ notes: big + '<script>x</script>' }), s => strip(s).slice(1), TODAY).notes).toHaveLength(20000);
  });
  it('rejects a request without any field', () => {
    expect(codeOf(() => decideSave(config, admin, doc(), req({}), identity, TODAY))).toBe('invalid-argument');
  });
});

describe('parseUploadRequest / decideUpload', () => {
  const up = (over: object = {}) => parseUploadRequest({ pageKey: 'p', topic: 'knoten', fileName: 'clip.mov', contentType: '', size: 1000, ...over });
  it('a video goes private, capped at MAX_VIDEO_BYTES, bound to its declared size', () => {
    expect(decideUpload(config, curator, up())).toEqual({ tab: 'videos', bucket: 'private', contentType: 'video/quicktime', maxBytes: 1000 });
    expect(codeOf(() => decideUpload(config, curator, up({ size: MAX_VIDEO_BYTES + 1 })))).toBe('invalid-argument');
    expect(decideUpload(config, curator, up({ size: MAX_VIDEO_BYTES })).maxBytes).toBe(MAX_VIDEO_BYTES);
  });
  it('images and files go to the default bucket, capped at 25 MB', () => {
    expect(decideUpload(config, curator, up({ fileName: 'a.JPG', contentType: 'image/jpeg' }))).toEqual({ tab: 'images', bucket: 'default', contentType: 'image/jpeg', maxBytes: 1000 });
    expect(decideUpload(config, curator, up({ fileName: 'plan.pdf' })).tab).toBe('files');
    expect(codeOf(() => decideUpload(config, curator, up({ fileName: 'plan.pdf', size: LEARNING_FILE_MAX_BYTES + 1 })))).toBe('invalid-argument');
  });
  it('the extension decides the content type; unknown or active types are refused', () => {
    expect(decideUpload(config, curator, up({ fileName: 'a.png', contentType: 'text/html' })).contentType).toBe('image/png');
    expect(codeOf(() => decideUpload(config, curator, up({ fileName: 'x.html', contentType: 'image/png' })))).toBe('invalid-argument');
    expect(codeOf(() => decideUpload(config, curator, up({ fileName: 'x.svg' })))).toBe('invalid-argument');
    expect(codeOf(() => decideUpload(config, curator, up({ fileName: 'noext' })))).toBe('invalid-argument');
    expect(codeOf(() => decideUpload(config, curator, up({ fileName: 'clip.webm' })))).toBe('invalid-argument');
  });
  it('topic must be a room topic the actor may upload to', () => {
    expect(codeOf(() => decideUpload(config, curator, up({ topic: 'recht' })))).toBe('permission-denied');
    expect(codeOf(() => decideUpload(config, member, up()))).toBe('permission-denied');
    expect(codeOf(() => decideUpload(config, admin, up({ topic: 'misc' })))).toBe('invalid-argument');
    expect(decideUpload(config, admin, up({ topic: 'recht' })).bucket).toBe('private');
  });
  it('rejects bad payloads', () => {
    expect(codeOf(() => up({ size: 0 }))).toBe('invalid-argument');
    expect(codeOf(() => up({ size: 1.5 }))).toBe('invalid-argument');
    expect(codeOf(() => up({ fileName: '' }))).toBe('invalid-argument');
    expect(codeOf(() => up({ pageKey: '../x' }))).toBe('invalid-argument');
  });
  it('builds the folder album path with a random segment', () => {
    expect(learningUploadPath(T, 'f1', 'Mein Clip.mov', 'r1')).toBe('tenant/scs/folder/f1/album/r1/Mein Clip.mov');
    expect(learningUploadPath(T, 'f1', '../../evil.pdf', 'r1')).toBe('tenant/scs/folder/f1/album/r1/_.._evil.pdf');
  });
});

describe('decideDelete', () => {
  it('detaches from the room folder when the doc sits elsewhere too', () => {
    expect(decideDelete(config, curator, doc({ folderKeys: ['f1', 'f9'] }), T, TODAY)).toEqual({ folderKeys: ['f9'], dateOfDocLastUpdate: TODAY });
  });
  it('archives (or detaches the tenant) per getDeletePatch when the room is the only folder', () => {
    expect(decideDelete(config, curator, doc(), T, TODAY)).toEqual({ isArchived: true, dateOfDocLastUpdate: TODAY });
    expect(decideDelete(config, curator, doc({ tenants: [T, 'kring'] }), T, TODAY)).toEqual({ tenants: ['kring'], dateOfDocLastUpdate: TODAY });
  });
  it('refuses a system doc instead of writing a no-op', () => {
    expect(codeOf(() => decideDelete(config, admin, doc({ tenants: ['system', T] }), T, TODAY))).toBe('failed-precondition');
  });
  it('follows canDeleteItem', () => {
    expect(codeOf(() => decideDelete(config, curator, doc({ tags: 'knoten, recht' }), T, TODAY))).toBe('permission-denied');
    expect(codeOf(() => decideDelete(config, member, doc({ tags: 'misc', authorKey: 'p9' }), T, TODAY))).toBe('permission-denied');
    expect(decideDelete(config, curator, doc({ tags: 'misc', authorKey: 'p1' }), T, TODAY)).toEqual({ isArchived: true, dateOfDocLastUpdate: TODAY });
  });
  it('parses its payload', () => {
    expect(parseDeleteRequest({ pageKey: 'p', docKey: 'd' })).toEqual({ pageKey: 'p', docKey: 'd' });
    expect(codeOf(() => parseDeleteRequest({ pageKey: 'p' }))).toBe('invalid-argument');
  });
});
