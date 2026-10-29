import { describe, expect, it } from 'vitest';
import { compareHlc, formatHlc, parseHlc, isValidHlc, receiveHlc, tickHlc } from './journal-hlc.util';

describe('journal hlc', () => {
  it('formatHlc sorts like the clock', () => {
    expect(formatHlc({ wall: 9, counter: 0, deviceId: 'a' }) < formatHlc({ wall: 10, counter: 0, deviceId: 'a' })).toBe(true);
    expect(compareHlc(formatHlc({ wall: 10, counter: 1, deviceId: 'a' }), formatHlc({ wall: 10, counter: 0, deviceId: 'z' }))).toBeGreaterThan(0);
  });

  it('parseHlc reverses formatHlc', () => {
    const h = { wall: 1792672881000, counter: 7, deviceId: 'ipad-bruno' };
    expect(parseHlc(formatHlc(h))).toEqual(h);
  });

  it('tick never goes backwards when the wall clock does', () => {
    expect(tickHlc({ wall: 1000, counter: 3, deviceId: 'a' }, 500, 'a')).toEqual({ wall: 1000, counter: 4, deviceId: 'a' });
  });

  it('tick takes the wall clock when it moved forward', () => {
    expect(tickHlc({ wall: 1000, counter: 3, deviceId: 'a' }, 2000, 'a')).toEqual({ wall: 2000, counter: 0, deviceId: 'a' });
    expect(tickHlc(undefined, 2000, 'a')).toEqual({ wall: 2000, counter: 0, deviceId: 'a' });
  });

  it('receive takes the larger wall time', () => {
    expect(receiveHlc({ wall: 1000, counter: 0, deviceId: 'a' }, { wall: 2000, counter: 5, deviceId: 'b' }, 1500))
      .toEqual({ wall: 2000, counter: 6, deviceId: 'a' });
  });

  it('receive uses the wall clock when it is ahead of both', () => {
    expect(receiveHlc({ wall: 1000, counter: 4, deviceId: 'a' }, { wall: 900, counter: 9, deviceId: 'b' }, 3000))
      .toEqual({ wall: 3000, counter: 0, deviceId: 'a' });
  });

  it('a device id with a path separator or non-ASCII characters is invalid', () => {
    expect(isValidHlc(formatHlc({ wall: 1, counter: 0, deviceId: 'a/b' }), 'a/b')).toBe(false);
    expect(isValidHlc(formatHlc({ wall: 1, counter: 0, deviceId: 'gerät' }), 'gerät')).toBe(false);
  });

  it('a uuid device id is valid', () => {
    const id = '3f2b8c1e-9d4a-4e7b-8a61-0c5d2f9e7b34';
    expect(isValidHlc(formatHlc({ wall: 1, counter: 0, deviceId: id }), id)).toBe(true);
  });
});
