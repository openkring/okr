import { describe, expect, it } from 'vitest';

import { generateHamiltonianPath, generateZipPuzzle, pickCheckpoints } from './zip.generator';
import { ZipCell, areAdjacent, cellKey, isSameCell } from './zip.model';
import { ZIP_COUNTS, ZIP_SIZES } from './zip.validations';

/** A deterministic stand-in for Math.random, so a failing case can be replayed. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function isHamiltonianPath(path: ZipCell[], size: number): boolean {
  if (path.length !== size * size) {
    return false;
  }
  if (new Set(path.map(cellKey)).size !== path.length) {
    return false;
  }
  return path.every((cell, index) => index === 0 || areAdjacent(path[index - 1], cell));
}

describe('generateHamiltonianPath', () => {
  it.each(ZIP_SIZES)('covers every cell of a %i-wide board with orthogonal steps', size => {
    for (let seed = 1; seed <= 20; seed++) {
      const path = generateHamiltonianPath(size, seededRandom(seed));
      expect(isHamiltonianPath(path, size), `size ${size}, seed ${seed}`).toBe(true);
    }
  });
});

describe('generateZipPuzzle', () => {
  it('produces a solvable board for every offered size and count', () => {
    for (const size of ZIP_SIZES) {
      for (const count of ZIP_COUNTS) {
        const puzzle = generateZipPuzzle({ size, count }, seededRandom(size * 100 + count));
        const label = `size ${size}, count ${count}`;

        expect(isHamiltonianPath(puzzle.solution, size), label).toBe(true);
        expect(puzzle.checkpoints.length, label).toBe(Math.min(count, size * size));

        // Every checkpoint lies on the solution, and they appear in the order the path walks it.
        const positions = puzzle.checkpoints.map(checkpoint =>
          puzzle.solution.findIndex(cell => isSameCell(cell, checkpoint)),
        );
        expect(positions.every(position => position !== -1), label).toBe(true);
        expect([...positions].sort((a, b) => a - b), label).toEqual(positions);
        expect(new Set(positions).size, label).toBe(positions.length);

        // The path starts on the first number and ends on the last.
        expect(positions[0], label).toBe(0);
        expect(positions[positions.length - 1], label).toBe(size * size - 1);
      }
    }
  });

  it('clamps a config that asks for more checkpoints than the board has cells', () => {
    const puzzle = generateZipPuzzle({ size: 3, count: 10 }, seededRandom(7));

    expect(puzzle.size).toBe(3);
    expect(puzzle.checkpoints.length).toBe(9);
  });

  it('varies the board between runs', () => {
    const first = generateZipPuzzle({ size: 5, count: 6 }, seededRandom(1));
    const second = generateZipPuzzle({ size: 5, count: 6 }, seededRandom(999));

    expect(first.solution).not.toEqual(second.solution);
  });
});

describe('pickCheckpoints', () => {
  const straight: ZipCell[] = Array.from({ length: 9 }, (_, index) => ({ row: 0, col: index }));

  it('always keeps the first and last cell of the path', () => {
    const checkpoints = pickCheckpoints(straight, 4, seededRandom(3));

    expect(checkpoints[0]).toEqual(straight[0]);
    expect(checkpoints[checkpoints.length - 1]).toEqual(straight[straight.length - 1]);
  });

  it('never repeats a cell, even when the jitter pushes indices together', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const checkpoints = pickCheckpoints(straight, 9, seededRandom(seed));
      expect(new Set(checkpoints.map(cellKey)).size, `seed ${seed}`).toBe(9);
    }
  });
});
