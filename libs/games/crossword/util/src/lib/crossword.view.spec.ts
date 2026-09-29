import { describe, expect, it } from 'vitest';
import { CrosswordEntry, CrosswordGrid } from '@okr/shared-models';
import { buildCellMap, cellAt, runFrom, runOf, runStart } from './crossword.view';

const entries: CrosswordEntry[] = [
  { answer: 'Ruder', clue: 'a' },
  { answer: 'Ente',  clue: 'b' },
];

// RUDER across, row 0, cols 0-4. ENTE down, col 3, rows 0-3. They cross at (0,3): RUDER[3]='E',
// ENTE[0]='E' — the same letter, a real intersection.
const grid: CrosswordGrid = {
  rows: 4, cols: 5, unplaced: [],
  placements: [
    { entry: 0, row: 0, col: 0, direction: 'across', number: 1 },
    { entry: 1, row: 0, col: 3, direction: 'down',   number: 2 },
  ],
};

describe('buildCellMap', () => {
  it('marks blocked cells and carries letters and numbers', () => {
    const map = buildCellMap(grid, entries);
    expect(map[0][0]).toEqual({ blocked: false, letter: 'R', number: 1 });
    expect(map[0][3]).toEqual({ blocked: false, letter: 'E', number: 2 });
    expect(map[3][4].blocked).toBe(true);
  });

  it('survives a placement pointing at an entry that no longer exists', () => {
    const broken: CrosswordGrid = { ...grid, placements: [...grid.placements, { entry: 99, row: 2, col: 0, direction: 'across', number: 3 }] };
    expect(() => buildCellMap(broken, entries)).not.toThrow();
    expect(buildCellMap(broken, entries)[2][0].blocked).toBe(true);
  });
});

describe('run helpers', () => {
  const map = buildCellMap(grid, entries);

  it('runOf on a cell that only belongs to an across word returns the whole across run', () => {
    expect(runOf(map, 0, 1, 'across')).toEqual([
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 },
    ]);
  });

  it('runOf on a cell that only belongs to a down word returns the whole down run', () => {
    expect(runOf(map, 1, 3, 'down')).toEqual([
      { row: 0, col: 3 }, { row: 1, col: 3 }, { row: 2, col: 3 }, { row: 3, col: 3 },
    ]);
  });

  it('runOf at the intersection returns the right run for each direction from the SAME cell', () => {
    expect(runOf(map, 0, 3, 'across')).toEqual([
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 },
    ]);
    expect(runOf(map, 0, 3, 'down')).toEqual([
      { row: 0, col: 3 }, { row: 1, col: 3 }, { row: 2, col: 3 }, { row: 3, col: 3 },
    ]);
  });

  it('runStart from the last cell of a run walks back to its first cell', () => {
    expect(runStart(map, 0, 4, 'across')).toEqual({ row: 0, col: 0 });
    expect(runStart(map, 3, 3, 'down')).toEqual({ row: 0, col: 3 });
  });

  it('runFrom from the first cell of a run reaches its last cell', () => {
    const run = runFrom(map, 0, 0, 'across');
    expect(run[run.length - 1]).toEqual({ row: 0, col: 4 });
  });

  it('a blocked cell has no run in either direction', () => {
    expect(map[3][4].blocked).toBe(true);
    expect(runOf(map, 3, 4, 'across')).toEqual([]);
    expect(runOf(map, 3, 4, 'down')).toEqual([]);
  });

  it('a cell outside rows/cols never throws and yields no run', () => {
    expect(() => runOf(map, -1, 0, 'across')).not.toThrow();
    expect(() => runOf(map, 0, 99, 'across')).not.toThrow();
    expect(() => runStart(map, 99, 99, 'down')).not.toThrow();
    expect(runOf(map, -1, 0, 'across')).toEqual([]);
    expect(runOf(map, 0, 99, 'across')).toEqual([]);
    expect(cellAt(map, 99, 99)).toBeUndefined();
  });
});
