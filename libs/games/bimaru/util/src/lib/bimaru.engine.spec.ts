import { describe, expect, it } from 'vitest';

import {
  BIMARU_FLEETS,
  BIMARU_SIZES,
  BimaruPuzzle,
  BimaruShip,
  Mark,
  completedShips,
  fillLineWithWater,
  formatDuration,
  generatePuzzle,
  hintCell,
  initialMarks,
  isSolved,
  markedSegment,
  nextMark,
  randomFleet,
  segmentAt,
  shipCells,
  shipGrid,
  solve,
  wrongCells,
} from './bimaru.engine';

/** Deterministic PRNG (mulberry32) so generator tests are repeatable. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function touches(ships: readonly BimaruShip[]): boolean {
  const cells = ships.map(s => shipCells(s));
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      for (const [r1, c1] of cells[i]) {
        for (const [r2, c2] of cells[j]) {
          if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) return true;
        }
      }
    }
  }
  return false;
}

function marksFromSolution(puzzle: BimaruPuzzle): Mark[][] {
  return shipGrid(puzzle.size, puzzle.ships).map(row => row.map((s): Mark => (s ? 'ship' : 'water')));
}

describe('randomFleet', () => {
  it('places the whole fleet inside the board without ships touching', () => {
    for (const size of BIMARU_SIZES) {
      for (let seed = 1; seed <= 10; seed++) {
        const ships = randomFleet(size, BIMARU_FLEETS[size], seeded(seed));
        expect(ships.map(s => s.len)).toEqual([...BIMARU_FLEETS[size]]);
        for (const ship of ships) {
          for (const [r, c] of shipCells(ship)) {
            expect(r).toBeLessThan(size);
            expect(c).toBeLessThan(size);
          }
        }
        expect(touches(ships)).toBe(false);
      }
    }
  });
});

describe('segmentAt', () => {
  const grid = shipGrid(5, [
    { len: 3, r: 0, c: 0, horizontal: true },
    { len: 2, r: 2, c: 4, horizontal: false },
    { len: 1, r: 4, c: 0, horizontal: true },
  ]);

  it('names ends, middles and submarines', () => {
    expect(segmentAt(grid, 0, 0)).toBe('left');
    expect(segmentAt(grid, 0, 1)).toBe('middle');
    expect(segmentAt(grid, 0, 2)).toBe('right');
    expect(segmentAt(grid, 2, 4)).toBe('top');
    expect(segmentAt(grid, 3, 4)).toBe('bottom');
    expect(segmentAt(grid, 4, 0)).toBe('single');
    expect(segmentAt(grid, 1, 1)).toBeNull();
  });
});

describe('solve', () => {
  it('finds the fleet when the givens pin it down', () => {
    // a 4×4 board with one 2-ship and one submarine
    const ships: BimaruShip[] = [
      { len: 2, r: 0, c: 0, horizontal: true },
      { len: 1, r: 2, c: 3, horizontal: true },
    ];
    const grid = shipGrid(4, ships);
    const rows = grid.map(row => row.filter(Boolean).length);
    const cols = [0, 1, 2, 3].map(c => grid.filter(row => row[c]).length);
    const { solutions, exhausted } = solve(4, [2, 1], rows, cols, [{ r: 0, c: 0, value: 'left' }]);
    expect(exhausted).toBe(false);
    expect(solutions).toHaveLength(1);
    expect(solutions[0]).toEqual(grid);
  });

  it('reports two solutions when the board is ambiguous', () => {
    // two submarines on a 3×3 with every line owing one: the two diagonals are both valid
    const { solutions } = solve(3, [1, 1], [1, 0, 1], [1, 0, 1], []);
    expect(solutions).toHaveLength(2);
  });

  it('respects a given water cell', () => {
    const { solutions } = solve(3, [1, 1], [1, 0, 1], [1, 0, 1], [{ r: 0, c: 0, value: 'water' }]);
    expect(solutions).toHaveLength(1);
    expect(solutions[0][0][2]).toBe(true);
  });

  it('rejects a placement whose segment contradicts a given', () => {
    // a lone "top" end needs a ship going down, which the counts forbid
    const { solutions } = solve(3, [1], [1, 0, 0], [1, 0, 0], [{ r: 0, c: 0, value: 'top' }]);
    expect(solutions).toHaveLength(0);
  });
});

describe('generatePuzzle', () => {
  it.each(BIMARU_SIZES)('produces a uniquely solvable %i×%i board', size => {
    for (let seed = 1; seed <= 3; seed++) {
      const puzzle = generatePuzzle(size, seeded(seed * 97 + size));
      const { solutions, exhausted } = solve(size, puzzle.fleet, puzzle.rowCounts, puzzle.colCounts, puzzle.givens, 2, 2_000_000);
      expect(exhausted).toBe(false);
      expect(solutions).toHaveLength(1);
      expect(solutions[0]).toEqual(shipGrid(size, puzzle.ships));
      // it must not simply give the whole board away
      expect(puzzle.givens.length).toBeLessThan(size * size / 2);
    }
  });
});

describe('playing', () => {
  const puzzle = generatePuzzle(6, seeded(42));

  it('starts with the givens filled in', () => {
    const marks = initialMarks(puzzle);
    for (const g of puzzle.givens) expect(marks[g.r][g.c]).toBe(g.value === 'water' ? 'water' : 'ship');
  });

  it('cycles unknown → water → ship → unknown', () => {
    expect(nextMark('unknown')).toBe('water');
    expect(nextMark('water')).toBe('ship');
    expect(nextMark('ship')).toBe('unknown');
  });

  it('is solved by the solution, with or without the water marked', () => {
    const full = marksFromSolution(puzzle);
    expect(isSolved(puzzle, full)).toBe(true);
    const shipsOnly = full.map(row => row.map((m): Mark => (m === 'ship' ? 'ship' : 'unknown')));
    expect(isSolved(puzzle, shipsOnly)).toBe(true);
    expect(isSolved(puzzle, initialMarks(puzzle))).toBe(false);
  });

  it('finds wrong marks and hints at them first', () => {
    const marks = marksFromSolution(puzzle);
    const [r, c] = shipCells(puzzle.ships[0])[0];
    marks[r][c] = 'water';
    expect(wrongCells(puzzle, marks)).toEqual([[r, c]]);
    expect(hintCell(puzzle, marks)).toEqual([r, c]);
  });

  it('has no hint left on a solved board', () => {
    expect(hintCell(puzzle, marksFromSolution(puzzle))).toBeNull();
  });

  it('fills only the unknown cells of a line with water', () => {
    const marks = initialMarks(puzzle);
    marks[0][0] = 'ship';
    const filled = fillLineWithWater(marks, 'row', 0);
    expect(filled[0][0]).toBe('ship');
    expect(filled[0].slice(1).every(m => m !== 'unknown')).toBe(true);
    expect(filled[1]).toEqual(marks[1]);
  });
});

describe('markedSegment and completedShips', () => {
  const W: Mark = 'water', S: Mark = 'ship', U: Mark = 'unknown';

  it('shapes a mark only once its neighbours settle it', () => {
    const marks: Mark[][] = [
      [S, S, W, U],
      [W, W, W, S],
      [S, W, U, U],
      [W, W, W, W],
    ];
    expect(markedSegment(marks, 0, 0)).toBe('left');
    expect(markedSegment(marks, 0, 1)).toBe('right');
    expect(markedSegment(marks, 2, 0)).toBe('single');
    expect(markedSegment(marks, 1, 3)).toBeNull();
    expect(markedSegment(marks, 3, 3)).toBeNull();
  });

  it('counts closed straight runs as ships', () => {
    const marks: Mark[][] = [
      [S, S, W, U],
      [W, W, W, S],
      [S, W, U, S],
      [W, W, W, W],
    ];
    // row 0: a closed 2-ship; (2,0) a submarine; column 3 is open at the top
    expect(completedShips(marks).sort()).toEqual([1, 2]);
    marks[0][3] = 'water';
    expect(completedShips(marks).sort()).toEqual([1, 2, 2]);
  });

  it('does not count ships that touch diagonally', () => {
    const marks: Mark[][] = [
      [S, W, W],
      [W, S, W],
      [W, W, W],
    ];
    expect(completedShips(marks)).toEqual([]);
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(83_000)).toBe('1:23');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});
