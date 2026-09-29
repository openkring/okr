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
});
