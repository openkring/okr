import { SCATTER_CORNER } from './mampf.maze';
import { DIR_VEC, DIRS, Dir, GhostId, Tile } from './mampf.types';

export function dist2(a: Tile, b: Tile): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/**
 * The tile a ghost heads for in chase mode — the four personalities.
 *
 * - `chaser` goes straight for the hero.
 * - `ambusher` aims 4 tiles ahead of the hero.
 * - `fickle` doubles the vector from the chaser to the tile 2 ahead of the hero.
 * - `shy` chases while more than 8 tiles away, and retreats to its corner when closer.
 */
export function chaseTarget(id: GhostId, hero: Tile, heroDir: Dir, self: Tile, chaser: Tile): Tile {
  const [dx, dy] = DIR_VEC[heroDir];
  switch (id) {
    case 'chaser':
      return hero;
    case 'ambusher':
      return [hero[0] + 4 * dx, hero[1] + 4 * dy];
    case 'fickle': {
      const px = hero[0] + 2 * dx;
      const py = hero[1] + 2 * dy;
      return [2 * px - chaser[0], 2 * py - chaser[1]];
    }
    case 'shy':
      return dist2(self, hero) > 64 ? hero : SCATTER_CORNER.shy;
  }
}

/**
 * Picks, among `options`, the direction whose neighbour tile is closest to `target`.
 * Ties go to the first in `DIRS` order (up, left, down, right).
 */
export function chooseDir(options: readonly Dir[], from: Tile, target: Tile): Dir {
  let best: Dir = options[0];
  let bestDist = Infinity;
  for (const d of DIRS) {
    if (!options.includes(d)) continue;
    const [dx, dy] = DIR_VEC[d];
    const dist = dist2([from[0] + dx, from[1] + dy], target);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}
