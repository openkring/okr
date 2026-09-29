import { describe, expect, it } from 'vitest';
import { CrosswordEntry, CrosswordGrid } from '@okr/shared-models';
import { generateCrossword, letterAt } from './crossword.generator';

/** A deterministic stand-in for Math.random, cycling a fixed sequence. */
function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const ROWING: CrosswordEntry[] = [
  { answer: 'Ruder', clue: 'Damit bewegt man das Boot' },
  { answer: 'Regatta', clue: 'Wettkampf auf dem Wasser' },
  { answer: 'Steg', clue: 'Zugang zum Wasser' },
  { answer: 'Riemen', clue: 'Einseitiges Ruder' },
  { answer: 'Achter', clue: 'Boot mit acht Ruderern' },
];

describe('generateCrossword', () => {
  it('places the words into a connected grid', () => {
    const grid = generateCrossword(ROWING, seeded([0.1, 0.7, 0.3]));
    expect(grid.placements.length).toBeGreaterThan(1);
    expect(grid.rows).toBeGreaterThan(0);
    expect(grid.cols).toBeGreaterThan(0);
  });

  it('is deterministic for a given sequence', () => {
    const a = generateCrossword(ROWING, seeded([0.1, 0.7, 0.3]));
    const b = generateCrossword(ROWING, seeded([0.1, 0.7, 0.3]));
    expect(a).toEqual(b);
  });

  it('normalises coordinates so the grid starts at 0,0', () => {
    const grid = generateCrossword(ROWING, seeded([0.4]));
    expect(Math.min(...grid.placements.map(p => p.row))).toBe(0);
    expect(Math.min(...grid.placements.map(p => p.col))).toBe(0);
  });

  it('numbers cells row-major starting at 1', () => {
    const grid = generateCrossword(ROWING, seeded([0.4]));
    const numbers = grid.placements.map(p => p.number).sort((x, y) => x - y);
    expect(numbers[0]).toBe(1);
  });

  it('gives two words starting in the same cell the same number', () => {
    const grid = generateCrossword(ROWING, seeded([0.2, 0.6]));
    const byCell = new Map<string, number[]>();
    for (const p of grid.placements) {
      const k = `${p.row},${p.col}`;
      byCell.set(k, [...(byCell.get(k) ?? []), p.number]);
    }
    for (const numbers of byCell.values()) {
      expect(new Set(numbers).size).toBe(1);
    }
  });

  it('reports entries it could not place', () => {
    const disjoint: CrosswordEntry[] = [
      { answer: 'AAA', clue: 'nur A' },
      { answer: 'BBB', clue: 'nur B' },
      { answer: 'CCC', clue: 'nur C' },
    ];
    const grid = generateCrossword(disjoint, seeded([0.5]));
    expect(grid.placements).toHaveLength(1);
    expect(grid.unplaced).toEqual([1, 2]);
  });

  it('returns an empty grid rather than throwing when nothing is usable', () => {
    const grid = generateCrossword([{ answer: 'Au', clue: 'zu kurz' }], seeded([0.5]));
    expect(grid.placements).toEqual([]);
    expect(grid.unplaced).toEqual([0]);
    expect(grid.rows).toBe(0);
    expect(grid.cols).toBe(0);
  });

  it('derives letters from the entries rather than storing them', () => {
    const grid = generateCrossword(ROWING, seeded([0.4]));
    const first = grid.placements[0];
    expect(letterAt(grid, ROWING, first.row, first.col)).toMatch(/[A-Z]/);
    expect(letterAt(grid, ROWING, 999, 999)).toBeUndefined();
  });

  it('skips a placement whose entry index has outlived the entries array, rather than throwing', () => {
    const twoEntries: CrosswordEntry[] = [
      { answer: 'Ruder', clue: 'Damit bewegt man das Boot' },
      { answer: 'Steg', clue: 'Zugang zum Wasser' },
    ];
    const grid: CrosswordGrid = {
      rows: 5,
      cols: 5,
      placements: [{ entry: 99, row: 0, col: 0, direction: 'across', number: 1 }],
      unplaced: [],
    };
    expect(() => letterAt(grid, twoEntries, 0, 0)).not.toThrow();
    expect(letterAt(grid, twoEntries, 0, 0)).toBeUndefined();
  });
});
