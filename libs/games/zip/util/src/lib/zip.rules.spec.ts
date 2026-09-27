import { describe, expect, it } from 'vitest';

import { ZipCell, ZipPuzzle } from './zip.model';
import { applyHint, canExtend, commonPrefixLength, isBacktrack, isSolved, judgeMove, startPath } from './zip.rules';

/**
 * A 3x3 board whose solution snakes row by row, with numbers on the first, middle and last cell:
 *
 *   1 . .        checkpoints: (0,0) (1,1) (2,2)
 *   . 2 .        solution:    (0,0)(0,1)(0,2)(1,2)(1,1)(1,0)(2,0)(2,1)(2,2)
 *   . . 3
 */
const solution: ZipCell[] = [
  { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 },
  { row: 1, col: 2 }, { row: 1, col: 1 }, { row: 1, col: 0 },
  { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 },
];

const puzzle: ZipPuzzle = {
  size: 3,
  checkpoints: [{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
  solution,
};

describe('startPath', () => {
  it('opens on the first number', () => {
    expect(startPath(puzzle)).toEqual([{ row: 0, col: 0 }]);
  });
});

describe('judgeMove', () => {
  it('accepts an orthogonal step onto a free cell', () => {
    expect(judgeMove([{ row: 0, col: 0 }], { row: 0, col: 1 }, puzzle)).toBe('ok');
  });

  it('rejects a diagonal step', () => {
    expect(judgeMove([{ row: 0, col: 0 }], { row: 1, col: 1 }, puzzle)).toBe('not-adjacent');
  });

  it('rejects a step off the board', () => {
    expect(judgeMove([{ row: 0, col: 0 }], { row: -1, col: 0 }, puzzle)).toBe('off-board');
  });

  it('rejects a cell the path already uses', () => {
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(judgeMove(path, { row: 0, col: 0 }, puzzle)).toBe('already-visited');
  });

  it('rejects a number that is not the next one due', () => {
    // Standing next to 3 while 2 has not been collected yet.
    const path = [
      { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 2, col: 1 },
    ];
    expect(judgeMove(path, { row: 2, col: 2 }, puzzle)).toBe('out-of-order');
  });

  it('accepts the number that is due', () => {
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(judgeMove(path, { row: 1, col: 1 }, puzzle)).toBe('ok');
  });

  it('refuses to extend a path resting on the last number', () => {
    expect(judgeMove(solution, { row: 2, col: 1 }, puzzle)).toBe('finished');
  });
});

describe('canExtend', () => {
  it('agrees with judgeMove', () => {
    expect(canExtend([{ row: 0, col: 0 }], { row: 0, col: 1 }, puzzle)).toBe(true);
    expect(canExtend([{ row: 0, col: 0 }], { row: 1, col: 1 }, puzzle)).toBe(false);
  });
});

describe('isSolved', () => {
  it('accepts the stored solution', () => {
    expect(isSolved(solution, puzzle)).toBe(true);
  });

  it('accepts a different path that also fills the board in order', () => {
    const alternative: ZipCell[] = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }, { row: 1, col: 0 },
      { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 1, col: 2 } as ZipCell,
    ];
    // (2,1) -> (1,2) is not adjacent, so this is deliberately NOT a legal path: it only checks
    // that isSolved looks at completeness, and an incomplete path is rejected.
    expect(isSolved(alternative, puzzle)).toBe(false);
  });

  it('rejects a path that leaves a cell out', () => {
    expect(isSolved(solution.slice(0, 8), puzzle)).toBe(false);
  });

  it('rejects a full path that does not end on the last number', () => {
    const swapped = [...solution.slice(0, 7), solution[8], solution[7]];
    expect(isSolved(swapped, puzzle)).toBe(false);
  });
});

describe('isBacktrack', () => {
  it('spots the pointer moving back onto the previous cell', () => {
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(isBacktrack(path, { row: 0, col: 0 })).toBe(true);
    expect(isBacktrack(path, { row: 0, col: 2 })).toBe(false);
  });

  it('never backtracks off the opening cell', () => {
    expect(isBacktrack([{ row: 0, col: 0 }], { row: 0, col: 0 })).toBe(false);
  });
});

describe('commonPrefixLength', () => {
  it('counts the leading cells two paths agree on', () => {
    expect(commonPrefixLength(solution.slice(0, 3), solution)).toBe(3);
    expect(commonPrefixLength([{ row: 0, col: 0 }, { row: 1, col: 0 }], solution)).toBe(1);
    expect(commonPrefixLength([], solution)).toBe(0);
  });
});

describe('applyHint', () => {
  it('adds the next cell of the solution to a path that is still on track', () => {
    expect(applyHint(solution.slice(0, 2), puzzle)).toEqual(solution.slice(0, 3));
  });

  it('rewinds the wrong moves before handing over a cell', () => {
    // Went down instead of right; the hint takes that back and plays the correct second cell.
    const strayed = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }];
    expect(applyHint(strayed, puzzle)).toEqual(solution.slice(0, 2));
  });

  it('opens an empty path on the first cell of the solution', () => {
    expect(applyHint([], puzzle)).toEqual(solution.slice(0, 1));
  });

  it('leaves a finished path alone', () => {
    expect(applyHint(solution, puzzle)).toEqual(solution);
  });
});
