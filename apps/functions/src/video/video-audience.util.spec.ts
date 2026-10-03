import { describe, expect, it } from 'vitest';
import { audienceOf, MAX_FOLDER_DEPTH, missingAncestors } from './video-audience.util';

const f = (parents: string[] = [], matrixRoomId = '') => ({ parents, matrixRoomId });
const ok = (rooms: string[] = []) => ({ rooms, unresolved: false });

describe('audienceOf', () => {
  it('has no room for a plain album folder', () => { expect(audienceOf(['a'], { a: f() })).toEqual(ok()); });
  it('has no room and is resolved for no start keys', () => { expect(audienceOf([], {})).toEqual(ok()); });
  it('finds the room on the root of a chat album', () => {
    const folders = { root: f([], '!r:hs'), y: f(['root']), v: f(['y']) };
    expect(audienceOf(['v'], folders)).toEqual(ok(['!r:hs']));
  });
  it('stops each chain at its nearest room', () => {
    const folders = { outer: f([], '!outer:hs'), inner: f(['outer'], '!inner:hs'), v: f(['inner']) };
    expect(audienceOf(['v'], folders)).toEqual(ok(['!inner:hs']));
  });
  it('collects every distinct room across all start chains', () => {
    const folders = { r1: f([], '!a:hs'), r2: f([], '!b:hs'), x: f(['r1']), plain: f() };
    expect(audienceOf(['x', 'r2', 'plain', 'r1'], folders)).toEqual(ok(['!a:hs', '!b:hs']));
  });
  it('follows only the first parent', () => {
    expect(audienceOf(['a'], { a: f(['p', 'roomy']), p: f(), roomy: f([], '!r:hs') })).toEqual(ok());
  });
  it('is unresolved for a missing start folder, a missing parent or an undefined entry', () => {
    expect(audienceOf(['a'], {}).unresolved).toBe(true);
    expect(audienceOf(['a'], { a: f(['gone']) }).unresolved).toBe(true);
    expect(audienceOf(['a'], { a: f(['gone']), gone: undefined }).unresolved).toBe(true);
  });
  it('is unresolved for a cycle', () => {
    expect(audienceOf(['a'], { a: f(['b']), b: f(['a']) }).unresolved).toBe(true);
  });
  it('is unresolved when the depth cap is hit before a root', () => {
    const folders: Record<string, ReturnType<typeof f>> = {};
    for (let i = 0; i < MAX_FOLDER_DEPTH + 3; i++) folders[`k${i}`] = f([`k${i + 1}`]);
    folders[`k${MAX_FOLDER_DEPTH + 3}`] = f([], '!far:hs');
    expect(audienceOf(['k0'], folders).unresolved).toBe(true);
  });
  it('resolves a chain exactly at the depth cap', () => {
    const folders: Record<string, ReturnType<typeof f>> = {};
    for (let i = 0; i < MAX_FOLDER_DEPTH; i++) folders[`k${i}`] = f([`k${i + 1}`]);
    folders[`k${MAX_FOLDER_DEPTH}`] = f([], '!r:hs');
    expect(audienceOf(['k0'], folders)).toEqual(ok(['!r:hs']));
  });
  it('treats a legacy folder without the field as no room', () => {
    expect(audienceOf(['a'], { a: { parents: [] } })).toEqual(ok());
  });
});

describe('missingAncestors', () => {
  it('lists first parents not yet loaded, once', () => {
    expect(missingAncestors({ a: f(['b']), c: f(['b', 'd']), e: f(['g']) }).sort()).toEqual(['b', 'g']);
  });
  it('does not re-request a parent already known to be missing', () => {
    expect(missingAncestors({ a: f(['b']), b: undefined })).toEqual([]);
  });
});
