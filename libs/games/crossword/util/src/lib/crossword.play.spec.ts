import { describe, expect, it } from 'vitest';
import { CrosswordEntry, CrosswordGrid } from '@okr/shared-models';
import { buildCellMap } from './crossword.view';
import {
  countWrong,
  finishedAtAfterEdit,
  hasExpandedLetters,
  inputLetter,
  isSolved,
  nextDirection,
  stepInRun,
} from './crossword.play';

const entries: CrosswordEntry[] = [
  { answer: 'Ruder', clue: 'a' },
  { answer: 'Ente',  clue: 'b' },
];

// RUDER across, row 0, cols 0-4. ENTE down, col 3, rows 0-3, crossing at (0,3).
const grid: CrosswordGrid = {
  rows: 4, cols: 5, unplaced: [],
  placements: [
    { entry: 0, row: 0, col: 0, direction: 'across', number: 1 },
    { entry: 1, row: 0, col: 3, direction: 'down',   number: 2 },
  ],
};
const map = buildCellMap(grid, entries);

/** Every unblocked cell filled with its solution letter. */
function solution(): Map<string, string> {
  const filled = new Map<string, string>();
  map.forEach((row, r) => row.forEach((cell, c) => { if (!cell.blocked) filled.set(`${r},${c}`, cell.letter); }));
  return filled;
}

describe('inputLetter', () => {
  it('uppercases a plain letter', () => {
    expect(inputLetter('a')).toBe('A');
  });

  it('types the first letter of an umlaut digraph instead of dropping it', () => {
    expect(inputLetter('ü')).toBe('U');
    expect(inputLetter('Ä')).toBe('A');
    expect(inputLetter('ö')).toBe('O');
    expect(inputLetter('ß')).toBe('S');
  });

  it('handles a decomposed umlaut (U + combining diaeresis)', () => {
    expect(inputLetter('u\u0308')).toBe('U');
  });

  it('folds accents', () => {
    expect(inputLetter('é')).toBe('E');
  });

  it('reads only the last character of a longer value', () => {
    expect(inputLetter('xb')).toBe('B');
  });

  it('returns undefined for anything that is no letter', () => {
    expect(inputLetter('1')).toBeUndefined();
    expect(inputLetter(' ')).toBeUndefined();
    expect(inputLetter('')).toBeUndefined();
  });
});

describe('hasExpandedLetters', () => {
  it('is true when an answer contains an umlaut or ß', () => {
    expect(hasExpandedLetters([{ answer: 'Brücke', clue: 'x' }])).toBe(true);
    expect(hasExpandedLetters([{ answer: 'Strasse', clue: 'x' }, { answer: 'Fuß', clue: 'y' }])).toBe(true);
  });

  it('is false for plain answers', () => {
    expect(hasExpandedLetters(entries)).toBe(false);
  });
});

describe('nextDirection', () => {
  it('picks the direction that has a run when nothing is selected', () => {
    expect(nextDirection(map, undefined, 0, 1)).toBe('across');
    expect(nextDirection(map, undefined, 2, 3)).toBe('down');
  });

  it('flips direction when the selected crossing cell is tapped again', () => {
    expect(nextDirection(map, { row: 0, col: 3, direction: 'across' }, 0, 3)).toBe('down');
    expect(nextDirection(map, { row: 0, col: 3, direction: 'down' }, 0, 3)).toBe('across');
  });

  it('keeps the current direction on a new cell where it still applies', () => {
    expect(nextDirection(map, { row: 0, col: 1, direction: 'down' }, 0, 3)).toBe('down');
  });

  it('falls back when the current direction has no run on the new cell', () => {
    expect(nextDirection(map, { row: 0, col: 3, direction: 'down' }, 0, 1)).toBe('across');
  });

  it('does not flip on a cell only one direction runs through', () => {
    expect(nextDirection(map, { row: 0, col: 1, direction: 'across' }, 0, 1)).toBe('across');
  });
});

describe('stepInRun', () => {
  it('moves forward and backward along the run', () => {
    expect(stepInRun(map, { row: 0, col: 1, direction: 'across' }, 1)).toEqual({ row: 0, col: 2, direction: 'across' });
    expect(stepInRun(map, { row: 2, col: 3, direction: 'down' }, -1)).toEqual({ row: 1, col: 3, direction: 'down' });
  });

  it('returns undefined past either end of the run', () => {
    expect(stepInRun(map, { row: 0, col: 4, direction: 'across' }, 1)).toBeUndefined();
    expect(stepInRun(map, { row: 0, col: 0, direction: 'across' }, -1)).toBeUndefined();
  });

  it('returns undefined for a blocked cursor cell', () => {
    expect(stepInRun(map, { row: 3, col: 4, direction: 'across' }, 1)).toBeUndefined();
  });
});

describe('isSolved', () => {
  it('is true when every unblocked cell holds its letter', () => {
    expect(isSolved(map, solution())).toBe(true);
  });

  it('is false with one wrong or missing letter', () => {
    const wrong = solution();
    wrong.set('0,0', 'X');
    expect(isSolved(map, wrong)).toBe(false);
    const missing = solution();
    missing.delete('3,3');
    expect(isSolved(map, missing)).toBe(false);
  });

  it('is never true for a grid without unblocked cells', () => {
    expect(isSolved([], new Map())).toBe(false);
    expect(isSolved([[{ blocked: true, letter: '', number: undefined }]], new Map())).toBe(false);
  });
});

describe('countWrong', () => {
  it('counts only filled cells whose letter differs', () => {
    const filled = new Map([['0,0', 'R'], ['0,1', 'X'], ['1,3', 'Q']]);
    expect(countWrong(map, filled)).toBe(2);
  });

  it('ignores blocked and out-of-bounds keys', () => {
    const filled = new Map([['3,4', 'A'], ['9,9', 'B']]);
    expect(countWrong(map, filled)).toBe(0);
  });
});

describe('finishedAtAfterEdit', () => {
  it('stamps now on the solving edit', () => {
    expect(finishedAtAfterEdit(false, true, undefined, 500)).toBe(500);
  });

  it('clears the stamp when a solved board is un-solved', () => {
    expect(finishedAtAfterEdit(true, false, 500, 900)).toBeUndefined();
  });

  it('leaves the stamp alone otherwise', () => {
    expect(finishedAtAfterEdit(true, true, 500, 900)).toBe(500);
    expect(finishedAtAfterEdit(false, false, undefined, 900)).toBeUndefined();
  });
});
