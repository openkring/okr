import { describe, expect, it } from 'vitest';
import { CrosswordEntry, CrosswordGrid } from '@okr/shared-models';
import { buildCellMap } from './crossword.view';

const entries: CrosswordEntry[] = [
  { answer: 'Ruder', clue: 'a' },
  { answer: 'Ente',  clue: 'b' },
];

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
