import { describe, expect, it } from 'vitest';

import {
  BOXES,
  PEERS,
  SUDOKU_DIFFICULTIES,
  SUDOKU_TARGET_GIVENS,
  SudokuPuzzle,
  boxOf,
  candidates,
  conflictCells,
  coordLabel,
  countSolutions,
  digitCounts,
  formatDuration,
  generatePuzzle,
  hintCell,
  isSolved,
  maskDigits,
  placeIntoNotes,
  randomSolution,
  solve,
  toggleNote,
  wrongCells,
} from './sudoku.engine';

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

/** Every row, column and box holds 1..9 exactly once. */
function isValidSolution(board: readonly number[]): boolean {
  const units: number[][] = [];
  for (let k = 0; k < 9; k++) {
    units.push(Array.from({ length: 9 }, (_, j) => k * 9 + j));
    units.push(Array.from({ length: 9 }, (_, j) => j * 9 + k));
    units.push([...BOXES[k]]);
  }
  return units.every(u => [...u.map(i => board[i])].sort().join('') === '123456789');
}

const parse = (s: string): number[] => s.replace(/\s/g, '').split('').map(ch => (ch === '.' ? 0 : Number(ch)));

// a well-known puzzle with exactly one solution
const CLASSIC = parse(`
  53..7.... 6..195... .98....6.
  8...6...3 4..8.3..1 7...2...6
  .6....28. ...419..5 ....8..79`);

describe('geometry', () => {
  it('gives every cell 20 peers', () => {
    expect(PEERS.every(p => p.length === 20)).toBe(true);
  });

  it('splits the board into 9 boxes of 9', () => {
    expect(BOXES.map(b => b.length)).toEqual(new Array(9).fill(9));
    expect(BOXES[4]).toEqual([30, 31, 32, 39, 40, 41, 48, 49, 50]);
    expect(boxOf(80)).toBe(8);
  });

  it('labels cells with column letter and row number', () => {
    expect(coordLabel(0)).toBe('A1');
    expect(coordLabel(80)).toBe('I9');
    expect(coordLabel(9 + 2)).toBe('C2');
  });
});

describe('solver', () => {
  it('solves a classic puzzle and finds it unique', () => {
    const solution = solve(CLASSIC);
    expect(solution).not.toBeNull();
    expect(isValidSolution(solution as number[])).toBe(true);
    expect(countSolutions(CLASSIC)).toBe(1);
  });

  it('reports more than one solution for an almost empty board', () => {
    expect(countSolutions(new Array(81).fill(0))).toBe(2);
  });

  it('reports none for a board that already breaks a rule', () => {
    const broken = [...CLASSIC];
    broken[2] = 5; // a second 5 in the first row
    expect(countSolutions(broken)).toBe(0);
    expect(solve(broken)).toBeNull();
  });
});

describe('generator', () => {
  it('deals a valid full board', () => {
    expect(isValidSolution(randomSolution(seeded(1)))).toBe(true);
  });

  it.each(SUDOKU_DIFFICULTIES)('makes a uniquely solvable %s puzzle that matches its solution', difficulty => {
    const p = generatePuzzle(difficulty, seeded(42));
    expect(isValidSolution(p.solution)).toBe(true);
    expect(p.givens.every((g, i) => g === 0 || g === p.solution[i])).toBe(true);
    expect(countSolutions(p.givens)).toBe(1);
    const clues = p.givens.filter(Boolean).length;
    expect(clues).toBeGreaterThanOrEqual(SUDOKU_TARGET_GIVENS[difficulty] - 1);
    expect(clues).toBeLessThan(81);
  });

  it('gives harder levels fewer clues', () => {
    const clues = SUDOKU_DIFFICULTIES.map(d => generatePuzzle(d, seeded(7)).givens.filter(Boolean).length);
    expect(clues[0]).toBeGreaterThan(clues[1]);
    expect(clues[1]).toBeGreaterThan(clues[2]);
  });

  it('is symmetric about the centre', () => {
    const p = generatePuzzle('medium', seeded(3));
    expect(p.givens.every((g, i) => !!g === !!p.givens[80 - i])).toBe(true);
  });
});

describe('play', () => {
  const puzzle: SudokuPuzzle = { difficulty: 'easy', givens: CLASSIC, solution: solve(CLASSIC) as number[] };

  it('finds cells that repeat in a unit', () => {
    const values = [...CLASSIC];
    values[2] = 3; // the first row already has a 3 at B1
    expect(conflictCells(values).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(conflictCells(CLASSIC)).toEqual([]);
  });

  it('finds filled cells that differ from the solution', () => {
    const values = [...CLASSIC];
    const empty = values.indexOf(0);
    values[empty] = puzzle.solution[empty] === 9 ? 8 : 9;
    expect(wrongCells(puzzle, values)).toEqual([empty]);
  });

  it('knows a solved board', () => {
    expect(isSolved(puzzle, CLASSIC)).toBe(false);
    expect(isSolved(puzzle, puzzle.solution)).toBe(true);
  });

  it('computes candidates from the peers', () => {
    // C1 (index 2): row has 5,3,7; column has 8; box has 5,3,6,9,8 → 1,2,4
    expect(maskDigits(candidates(CLASSIC, 2))).toEqual([1, 2, 4]);
  });

  it('hints the selected cell, else a wrong cell, else the most constrained empty cell', () => {
    expect(hintCell(puzzle, CLASSIC, 2)).toBe(2);
    const wrong = [...CLASSIC];
    wrong[2] = puzzle.solution[2] === 1 ? 2 : 1;
    expect(hintCell(puzzle, wrong)).toBe(2);
    const next = hintCell(puzzle, CLASSIC) as number;
    expect(CLASSIC[next]).toBe(0);
    expect(maskDigits(candidates(CLASSIC, next))).toHaveLength(1);
    expect(hintCell(puzzle, puzzle.solution)).toBeNull();
  });

  it('counts placed digits', () => {
    expect(digitCounts(puzzle.solution).slice(1)).toEqual(new Array(9).fill(9));
  });

  it('toggles notes and clears them from peers on placement', () => {
    let notes = new Array(81).fill(0);
    notes = toggleNote(notes, 0, 4);
    notes = toggleNote(notes, 1, 4);
    notes = toggleNote(notes, 80, 4);
    expect(maskDigits(notes[0])).toEqual([4]);
    notes = toggleNote(notes, 0, 4);
    expect(notes[0]).toBe(0);
    notes = placeIntoNotes(notes, 10, 4); // B2 shares a box with B1, not with I9
    expect(notes[1]).toBe(0);
    expect(maskDigits(notes[80])).toEqual([4]);
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});
