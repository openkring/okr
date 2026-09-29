import { describe, expect, it } from 'vitest';
import { CrosswordEntry, CrosswordGrid } from '@okr/shared-models';
import { REROLL_VARIETY, generateCrossword, sameLayout } from './crossword.generator';
import { buildCellMap } from './crossword.view';

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

  it('gives two successive empty-grid results independent placements arrays (no shared-reference leak)', () => {
    const tooShort: CrosswordEntry[] = [{ answer: 'Au', clue: 'zu kurz' }];
    const first = generateCrossword(tooShort, seeded([0.5]));
    expect(first.placements).toEqual([]);

    // mutate the first result's placements — if the generator ever handed out the same
    // module-level empty array on every call, this would leak into `second` below
    (first.placements as unknown[]).push({ entry: 0, row: 0, col: 0, direction: 'across', number: 1 });

    const second = generateCrossword(tooShort, seeded([0.5]));
    expect(second.placements).toEqual([]);
    expect(second.placements).not.toBe(first.placements);
  });
});

describe('re-roll variety', () => {
  /** Distinct layouts produced over a range of random sequences. */
  function distinctLayouts(variety: number): CrosswordGrid[] {
    const layouts: CrosswordGrid[] = [];
    for (let i = 0; i < 20; i++) {
      const grid = generateCrossword(ROWING, seeded([i / 20, (i * 7 % 20) / 20, (i * 13 % 20) / 20]), variety);
      if (!layouts.some(known => sameLayout(known, grid))) layouts.push(grid);
    }
    return layouts;
  }

  it('produces more than one layout for the same words', () => {
    expect(distinctLayouts(REROLL_VARIETY).length).toBeGreaterThan(1);
  });

  it('keeps every varied layout one connected grid', () => {
    for (const grid of distinctLayouts(REROLL_VARIETY)) {
      const map = buildCellMap(grid, ROWING);
      const open: string[] = [];
      map.forEach((row, r) => row.forEach((cell, c) => { if (!cell.blocked) open.push(`${r},${c}`); }));
      const seen = new Set<string>([open[0]]);
      const stack = [open[0]];
      while (stack.length > 0) {
        const [r, c] = (stack.pop() as string).split(',').map(Number);
        for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
          const key = `${nr},${nc}`;
          if (map[nr]?.[nc] && !map[nr][nc].blocked && !seen.has(key)) { seen.add(key); stack.push(key); }
        }
      }
      expect(seen.size).toBe(open.length);
    }
  });
});

describe('sameLayout', () => {
  const grid: CrosswordGrid = {
    rows: 4, cols: 5, unplaced: [],
    placements: [
      { entry: 0, row: 0, col: 0, direction: 'across', number: 1 },
      { entry: 1, row: 0, col: 3, direction: 'down', number: 2 },
    ],
  };

  it('is true for the same placements in any order', () => {
    expect(sameLayout(grid, { ...grid, placements: [...grid.placements].reverse() })).toBe(true);
  });

  it('is false when a word moved or the size changed', () => {
    const moved = { ...grid, placements: [grid.placements[0], { ...grid.placements[1], col: 2 }] };
    expect(sameLayout(grid, moved)).toBe(false);
    expect(sameLayout(grid, { ...grid, rows: 5 })).toBe(false);
  });
});
