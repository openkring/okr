import { describe, expect, it } from 'vitest';
import { toStrokes } from './jass.strokes';

describe('toStrokes', () => {
  it.each([
    [0, { hundreds: 0, fifties: 0, twenties: 0, rest: 0 }],
    [19, { hundreds: 0, fifties: 0, twenties: 0, rest: 19 }],
    [20, { hundreds: 0, fifties: 0, twenties: 1, rest: 0 }],
    [49, { hundreds: 0, fifties: 0, twenties: 2, rest: 9 }],
    [170, { hundreds: 1, fifties: 1, twenties: 1, rest: 0 }],
    [1000, { hundreds: 10, fifties: 0, twenties: 0, rest: 0 }],
    [1257, { hundreds: 12, fifties: 1, twenties: 0, rest: 7 }],
  ])('%i', (points, expected) => expect(toStrokes(points)).toEqual(expected));
  it('treats negative or fractional input as its floor, never below 0', () => {
    expect(toStrokes(-5)).toEqual({ hundreds: 0, fifties: 0, twenties: 0, rest: 0 });
    expect(toStrokes(20.9).twenties).toBe(1);
  });
});
