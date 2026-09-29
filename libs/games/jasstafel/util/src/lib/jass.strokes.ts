import { JassStrokes } from './jass.types';

/**
 * Splits a total into the marks of a chalk Jasstafel: one cross on the Z's 100-stroke per
 * hundred, then one mark each on the 50- and 20-strokes, and the remainder as tally marks.
 */
export function toStrokes(points: number): JassStrokes {
  let r = Math.max(0, Math.floor(points));
  const hundreds = Math.floor(r / 100); r %= 100;
  const fifties = Math.floor(r / 50); r %= 50;
  const twenties = Math.floor(r / 20); r %= 20;
  return { hundreds, fifties, twenties, rest: r };
}
