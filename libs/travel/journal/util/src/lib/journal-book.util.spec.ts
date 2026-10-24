import { describe, expect, it } from 'vitest';
import { stripUndefined } from './journal-book.util';

class Sentinel { constructor(public readonly tag: string) {} }

describe('stripUndefined', () => {
  it('drops undefined values at every depth', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: 'x' }, f: [1, undefined, { g: undefined, h: 2 }] }))
      .toEqual({ a: 1, c: { e: 'x' }, f: [1, { h: 2 }] });
  });
  it('keeps class-instance sentinels as the same instance', () => {
    const s = new Sentinel('delete');
    const out = stripUndefined({ albums: { k: s }, x: undefined });
    expect(out.albums.k).toBe(s);
    expect('x' in out).toBe(false);
  });
  it('keeps null, false, 0 and empty values', () => {
    expect(stripUndefined({ a: null, b: false, c: 0, d: '', e: [] })).toEqual({ a: null, b: false, c: 0, d: '', e: [] });
  });
});
