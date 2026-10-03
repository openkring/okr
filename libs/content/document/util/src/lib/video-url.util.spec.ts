import { describe, expect, it } from 'vitest';
import { mergeSigned, missingKeys, needsResign, RESIGN_MARGIN_MS, SignedVideo } from './video-url.util';

const v = (key: string): SignedVideo => ({ key, posterUrl: 'p', playback: { kind: 'mp4', url: 'u' } });

describe('needsResign', () => {
  it('is true without an expiry', () => { expect(needsResign(undefined, 0)).toBe(true); });
  it('is false well before expiry', () => { expect(needsResign(10 * RESIGN_MARGIN_MS, 0)).toBe(false); });
  it('is true inside the margin', () => { expect(needsResign(1000, 1000 - RESIGN_MARGIN_MS + 1)).toBe(true); });
  it('is true after expiry', () => { expect(needsResign(1000, 2000)).toBe(true); });
});

describe('missingKeys', () => {
  it('returns the unsigned keys while the window is fresh', () => {
    expect(missingKeys(['a', 'b'], { a: v('a') }, 10 * RESIGN_MARGIN_MS, 0)).toEqual(['b']);
  });
  it('returns every key once the window is stale', () => {
    expect(missingKeys(['a', 'b'], { a: v('a') }, 1000, 2000)).toEqual(['a', 'b']);
  });
  it('dedupes and drops empties', () => {
    expect(missingKeys(['a', 'a', ''], {}, undefined, 0)).toEqual(['a']);
  });
});

describe('mergeSigned', () => {
  it('merges into the same window and keeps earlier keys', () => {
    const r = mergeSigned({ a: v('a') }, 100, [v('b')], 100);
    expect(Object.keys(r.signed).sort()).toEqual(['a', 'b']);
    expect(r.expires).toBe(100);
  });
  it('keeps both results of overlapping first loads in the same new window', () => {
    const first = mergeSigned({}, undefined, [v('a')], 100);
    const second = mergeSigned(first.signed, first.expires, [v('b')], 100);
    expect(Object.keys(second.signed).sort()).toEqual(['a', 'b']);
    expect(second.expires).toBe(100);
  });
  it('resets on a newer window', () => {
    const r = mergeSigned({ a: v('a') }, 100, [v('b')], 200);
    expect(Object.keys(r.signed)).toEqual(['b']);
    expect(r.expires).toBe(200);
  });
  it('ignores a late response from an older window', () => {
    const cur = { a: v('a') };
    const r = mergeSigned(cur, 200, [v('b')], 100);
    expect(r.signed).toBe(cur);
    expect(r.expires).toBe(200);
  });
});
