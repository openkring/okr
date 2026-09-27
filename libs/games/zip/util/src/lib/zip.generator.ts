import { ZipCell, ZipConfig, ZipPuzzle, ZipRandom, cellKey, neighbours } from './zip.model';
import { clampZipConfig } from './zip.validations';

/**
 * Builds a random, guaranteed-solvable board.
 *
 * Solvability is structural rather than checked afterwards: a Hamiltonian path over the whole
 * grid is drawn FIRST, and the checkpoints are then placed on cells of that path in the order
 * the path visits them. Whatever comes out, walking the stored path in order satisfies both
 * rules of the game — every cell visited once, every number reached in sequence.
 *
 * `config` is clamped before use, so callers may hand over raw control values.
 */
export function generateZipPuzzle(config: ZipConfig, random: ZipRandom = Math.random): ZipPuzzle {
  const { size, count } = clampZipConfig(config);
  const solution = generateHamiltonianPath(size, random);
  const checkpoints = pickCheckpoints(solution, count, random);
  return { size, checkpoints, solution };
}

/**
 * A random path visiting every cell of a `size * size` board exactly once, each step orthogonal.
 *
 * Randomised depth-first search with backtracking. The search would blow up on its own — most
 * partial paths strand a cell — so every candidate step is pruned by a reachability test: after
 * stepping onto it, all still-unvisited cells must remain reachable from there. That is what
 * keeps a 6x6 board (36 cells) resolving in a few thousand steps instead of exhausting the
 * search space. A board this small always has a solution, so the search cannot fail; the
 * `attempts` budget only guards against a pathological seed and restarts from a new origin.
 */
export function generateHamiltonianPath(size: number, random: ZipRandom = Math.random): ZipCell[] {
  const total = size * size;

  for (let attempt = 0; attempt < 32; attempt++) {
    const start: ZipCell = {
      row: Math.floor(random() * size),
      col: Math.floor(random() * size),
    };
    const path = [start];
    const visited = new Set([cellKey(start)]);

    if (extendPath(path, visited, size, total, random)) {
      return path;
    }
  }

  // Unreachable for 3..6 (every such board has a Hamiltonian path, and the search is exhaustive
  // within one attempt). Falls back to the boustrophedon path, which is always valid.
  return serpentinePath(size);
}

/** Depth-first step. Mutates `path`/`visited`; returns true once the path covers the board. */
function extendPath(
  path: ZipCell[],
  visited: Set<string>,
  size: number,
  total: number,
  random: ZipRandom,
): boolean {
  if (path.length === total) {
    return true;
  }

  const current = path[path.length - 1];
  const candidates = shuffle(
    neighbours(current, size).filter(candidate => !visited.has(cellKey(candidate))),
    random,
  );

  for (const candidate of candidates) {
    visited.add(cellKey(candidate));
    path.push(candidate);

    if (keepsRestReachable(candidate, visited, size, total) && extendPath(path, visited, size, total, random)) {
      return true;
    }

    path.pop();
    visited.delete(cellKey(candidate));
  }

  return false;
}

/**
 * True when every cell not yet visited can still be walked to from `from`. A flood fill over
 * unvisited cells: if it reaches fewer than all of them, some cell has been cut off and this
 * branch can never complete, so the caller abandons it immediately.
 */
function keepsRestReachable(from: ZipCell, visited: Set<string>, size: number, total: number): boolean {
  const remaining = total - visited.size;
  if (remaining === 0) {
    return true;
  }

  const seen = new Set<string>();
  const queue = neighbours(from, size).filter(cell => !visited.has(cellKey(cell)));
  queue.forEach(cell => seen.add(cellKey(cell)));

  for (let head = 0; head < queue.length; head++) {
    for (const next of neighbours(queue[head], size)) {
      const key = cellKey(next);
      if (!visited.has(key) && !seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }

  return seen.size === remaining;
}

/** Row-by-row snake path. Always a valid Hamiltonian path; the generator's safety net. */
function serpentinePath(size: number): ZipCell[] {
  const path: ZipCell[] = [];
  for (let row = 0; row < size; row++) {
    for (let step = 0; step < size; step++) {
      path.push({ row, col: row % 2 === 0 ? step : size - 1 - step });
    }
  }
  return path;
}

/**
 * Places `count` checkpoints along `solution`, ascending.
 *
 * The first and last cell of the path always carry a number — the player has to start somewhere
 * and the board is only solved on the final number — and the rest are spread evenly with a
 * one-cell jitter so boards do not all feel alike. Each index is then forced above its
 * predecessor and low enough to leave room for the checkpoints still to come, which keeps them
 * strictly ascending and distinct.
 */
export function pickCheckpoints(solution: ZipCell[], count: number, random: ZipRandom = Math.random): ZipCell[] {
  const last = solution.length - 1;
  const indices: number[] = [0];

  for (let position = 1; position < count - 1; position++) {
    const even = Math.round((position * last) / (count - 1));
    const jittered = even + Math.floor(random() * 3) - 1;
    const lowest = indices[position - 1] + 1;
    const highest = last - (count - 1 - position);
    indices.push(Math.min(Math.max(jittered, lowest), highest));
  }

  if (count > 1) {
    indices.push(last);
  }

  return indices.map(index => solution[index]);
}

/** Fisher-Yates, drawing from `random`. Returns a new array. */
function shuffle<T>(items: T[], random: ZipRandom): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}
