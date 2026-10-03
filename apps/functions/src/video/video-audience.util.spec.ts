import { describe, expect, it } from 'vitest';
import { audienceRoomOf, MAX_FOLDER_DEPTH, missingAncestors } from './video-audience.util';

const f = (parents: string[] = [], matrixRoomId = '') => ({ parents, matrixRoomId });

describe('audienceRoomOf', () => {
  it('is empty for a plain album folder', () => { expect(audienceRoomOf(['a'], { a: f() })).toBe(''); });
  it('finds the room on the root of a chat album', () => {
    const folders = { root: f([], '!r:hs'), y: f(['root']), v: f(['y']) };
    expect(audienceRoomOf(['v'], folders)).toBe('!r:hs');
  });
  it('stops at the nearest room', () => {
    const folders = { outer: f([], '!outer:hs'), inner: f(['outer'], '!inner:hs'), v: f(['inner']) };
    expect(audienceRoomOf(['v'], folders)).toBe('!inner:hs');
  });
  it('survives a cycle and a missing parent', () => {
    expect(audienceRoomOf(['a'], { a: f(['b']), b: f(['a']) })).toBe('');
    expect(audienceRoomOf(['a'], { a: f(['gone']) })).toBe('');
  });
  it('caps the depth', () => {
    const folders: Record<string, ReturnType<typeof f>> = {};
    for (let i = 0; i < MAX_FOLDER_DEPTH + 3; i++) folders[`k${i}`] = f([`k${i + 1}`]);
    folders[`k${MAX_FOLDER_DEPTH + 3}`] = f([], '!far:hs');
    expect(audienceRoomOf(['k0'], folders)).toBe('');
  });
  it('treats a legacy folder without the field as no room', () => {
    expect(audienceRoomOf(['a'], { a: { parents: [] } })).toBe('');
  });
});

describe('missingAncestors', () => {
  it('lists referenced parents not yet loaded, once', () => {
    expect(missingAncestors({ a: f(['b']), c: f(['b', 'd']) }).sort()).toEqual(['b', 'd']);
  });
});
