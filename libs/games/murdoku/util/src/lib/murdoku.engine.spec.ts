import { describe, expect, it } from 'vitest';

import {
  MURDOKU_DIFFICULTIES,
  MurdokuPuzzle,
  boardSize,
  clueHolds,
  colOf,
  conflictPeople,
  coordLabel,
  formatDuration,
  generatePuzzle,
  hintPerson,
  isBlocking,
  isComplete,
  isSolved,
  makeRooms,
  neighbours,
  rowOf,
  seededRng,
  solve,
} from './murdoku.engine';

const SEEDS = [11, 4242, 31337, 70001, 99999];

function roomIsContiguous(rooms: number[], n: number, room: number): boolean {
  const cells = rooms.map((r, i) => (r === room ? i : -1)).filter(i => i >= 0);
  const seen = new Set([cells[0]]);
  const queue = [cells[0]];
  while (queue.length) {
    const c = queue.pop() as number;
    for (const d of neighbours(c, n)) if (rooms[d] === room && !seen.has(d)) { seen.add(d); queue.push(d); }
  }
  return seen.size === cells.length;
}

describe('murdoku helpers', () => {
  it('labels coordinates column-letter, row-number', () => {
    expect(coordLabel(0, 5)).toBe('A1');
    expect(coordLabel(7, 5)).toBe('C2');
    expect(coordLabel(35, 6)).toBe('F6');
  });

  it('finds edge neighbours only', () => {
    expect(neighbours(0, 4).sort()).toEqual([1, 4]);
    expect(neighbours(5, 4).sort((a, b) => a - b)).toEqual([1, 4, 6, 9]);
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(247_900)).toBe('4:07');
  });

  it('grows contiguous rooms of at least two squares', () => {
    const rooms = makeRooms(6, 6, seededRng(5)) as number[];
    expect(rooms).toHaveLength(36);
    for (let r = 0; r < 6; r++) {
      expect(rooms.filter(x => x === r).length).toBeGreaterThanOrEqual(2);
      expect(roomIsContiguous(rooms, 6, r)).toBe(true);
    }
  });
});

describe.each(MURDOKU_DIFFICULTIES)('generatePuzzle(%s)', difficulty => {
  const puzzles: MurdokuPuzzle[] = SEEDS.map(seed => generatePuzzle(difficulty, seed));

  it('is deterministic for a seed', () => {
    expect(generatePuzzle(difficulty, SEEDS[0])).toEqual(puzzles[0]);
  });

  it('places one person per row and column, never on blocking furniture', () => {
    for (const p of puzzles) {
      const n = boardSize(difficulty);
      expect(p.n).toBe(n);
      expect(new Set(p.solution.map(c => rowOf(c, n))).size).toBe(n);
      expect(new Set(p.solution.map(c => colOf(c, n))).size).toBe(n);
      expect(p.solution.some(c => isBlocking(p.furniture[c]))).toBe(false);
    }
  });

  it('puts exactly the killer in the victim\'s room', () => {
    for (const p of puzzles) {
      const room = p.rooms[p.solution[p.victim]];
      const there = p.solution.map((c, i) => (p.rooms[c] === room ? i : -1)).filter(i => i >= 0);
      expect(there.sort()).toEqual([p.victim, p.killer].sort());
    }
  });

  it('only states what is true, and gives everyone at least one statement', () => {
    for (const p of puzzles) {
      for (const c of p.clues) expect(clueHolds(c, p.solution, p)).toBe(true);
      for (let i = 0; i < p.n; i++) expect(p.clues.some(c => c.p === i)).toBe(true);
    }
  });

  it('has exactly one solution', () => {
    for (const p of puzzles) {
      const found = solve(p, p.clues, 2);
      expect(found).toHaveLength(1);
      expect(found[0]).toEqual(p.solution);
    }
  });
});

describe('placement checks', () => {
  const p = generatePuzzle('easy', 123);

  it('reports row and column clashes', () => {
    const placement: (number | null)[] = [0, 1, null, null];
    expect([...conflictPeople(p, placement)].sort()).toEqual([0, 1]);
    expect(conflictPeople(p, [0, 5, null, null]).size).toBe(0);
  });

  it('recognises completion and the solution', () => {
    expect(isComplete([0, null, 2, 3])).toBe(false);
    expect(isSolved(p, [...p.solution])).toBe(true);
    expect(isSolved(p, [null, ...p.solution.slice(1)])).toBe(false);
  });

  it('hints someone who is not yet in place', () => {
    const placement = [...p.solution] as (number | null)[];
    placement[2] = null;
    expect(hintPerson(p, placement)).toBe(2);
    expect(hintPerson(p, [...p.solution])).toBeNull();
  });
});
