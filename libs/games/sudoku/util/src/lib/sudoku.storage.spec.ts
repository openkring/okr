import { describe, expect, it } from 'vitest';

import { generatePuzzle } from './sudoku.engine';
import { SudokuGame, parseGame, serializeGame } from './sudoku.storage';

function game(): SudokuGame {
  const p = generatePuzzle('easy', () => 0.5);
  return {
    difficulty: p.difficulty,
    givens: p.givens,
    solution: p.solution,
    values: [...p.givens],
    notes: new Array(81).fill(0),
    hinted: [],
    hints: 0,
    elapsedMs: 1234,
    solved: false,
  };
}

describe('parseGame', () => {
  it('round-trips a saved game', () => {
    const g = game();
    expect(parseGame(serializeGame(g))).toEqual(g);
  });

  it('treats missing or broken entries as absent', () => {
    expect(parseGame(null)).toBeNull();
    expect(parseGame('{not json')).toBeNull();
    expect(parseGame('[]')).toBeNull();
  });

  it('rejects inconsistent fields', () => {
    const bad = (patch: Partial<Record<keyof SudokuGame, unknown>>) => parseGame(JSON.stringify({ ...game(), ...patch }));
    expect(bad({ difficulty: 'extreme' })).toBeNull();
    expect(bad({ values: [1, 2, 3] })).toBeNull();
    expect(bad({ notes: new Array(81).fill(2048) })).toBeNull();
    expect(bad({ hinted: [81] })).toBeNull();
    expect(bad({ elapsedMs: -1 })).toBeNull();

    const g = game();
    const clue = g.givens.findIndex(Boolean);
    const values = [...g.values];
    values[clue] = 0; // a clue was erased
    expect(bad({ values })).toBeNull();
  });
});
