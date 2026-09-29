import { describe, expect, it } from 'vitest';
import { canPlace, PlacedWord } from './crossword.rules';

const across = (row: number, col: number, answer: string): PlacedWord =>
  ({ answer, row, col, direction: 'across', entry: 0 });

describe('canPlace', () => {
  it('accepts a crossing where the shared letter matches', () => {
    const placed = [across(0, 0, 'RUDER')];
    // BOOT down through the R at (0,3)... 'RUDER'[3] === 'E', so use a word with E
    expect(canPlace(placed, { answer: 'ENTE', row: 0, col: 3, direction: 'down', entry: 1 })).toBe(true);
  });

  it('refuses a crossing where the shared letter differs', () => {
    const placed = [across(0, 0, 'RUDER')];
    expect(canPlace(placed, { answer: 'BOOT', row: 0, col: 3, direction: 'down', entry: 1 })).toBe(false);
  });

  it('refuses a word that runs flush alongside another', () => {
    const placed = [across(0, 0, 'RUDER')];
    // ENTE directly under RUDER shares no cell but touches along its whole length
    expect(canPlace(placed, { answer: 'ENTE', row: 1, col: 0, direction: 'across', entry: 1 })).toBe(false);
  });

  it('refuses a word butted head-to-tail against another', () => {
    const placed = [across(0, 0, 'RUDER')];
    expect(canPlace(placed, { answer: 'BOOT', row: 0, col: 5, direction: 'across', entry: 1 })).toBe(false);
  });

  it('refuses a word with no crossing at all', () => {
    const placed = [across(0, 0, 'RUDER')];
    expect(canPlace(placed, { answer: 'BOOT', row: 5, col: 5, direction: 'across', entry: 1 })).toBe(false);
  });

  it('refuses a same-direction candidate that strictly contains an already-placed word', () => {
    // 'OST' at (0,1) sits fully inside 'KOSTEN' at (0,0) — every overlapped letter matches,
    // but this is two clues on one collinear run, not a crossing, and must be rejected
    const placed = [across(0, 1, 'OST')];
    expect(canPlace(placed, { answer: 'KOSTEN', row: 0, col: 0, direction: 'across', entry: 1 })).toBe(false);
  });

  it('still accepts a legitimate perpendicular crossing between words of differing length', () => {
    // guard against over-rejecting: a genuine crossing (different directions) must still work
    // even when one word is much longer than the other
    const placed = [across(0, 1, 'OST')];
    // 'OST'[1] === 'S'; a down word crossing through that S at (0,2)
    expect(canPlace(placed, { answer: 'STEG', row: 0, col: 2, direction: 'down', entry: 1 })).toBe(true);
  });
});
