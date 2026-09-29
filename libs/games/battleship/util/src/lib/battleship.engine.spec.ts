import { describe, expect, it } from 'vitest';

import {
  AiLevel, FLEET, aiChooseShot, canPlace, createBoard, fire, placeShip, randomFleet, surroundingCells,
} from './battleship.engine';

/** Deterministic LCG, so the simulations are reproducible. */
function seeded(seed: number): () => number {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe('battleship fleet placement', () => {
  it.each([false, true])('places a valid fleet (allowTouch=%s)', allowTouch => {
    const rng = seeded(11);
    for (let i = 0; i < 100; i++) {
      const b = randomFleet(allowTouch, rng);
      expect(b.ships).toHaveLength(FLEET.length);
      expect(b.cells.flat().filter(c => c.ship !== -1)).toHaveLength(17);
      if (!allowTouch) {
        b.ships.forEach((s, idx) => {
          for (const [r, c] of surroundingCells(s)) expect([-1, idx]).toContain(b.cells[r][c].ship);
        });
      }
    }
  });

  it('refuses touching ships under the classic rule', () => {
    const b = placeShip(createBoard(), FLEET[4], 0, 0, true);
    expect(canPlace(b, 1, 1, 2, true, false)).toBe(false);
    expect(canPlace(b, 1, 1, 2, true, true)).toBe(true);
    expect(canPlace(b, 2, 0, 2, true, false)).toBe(true);
  });

  it('never mutates the board it is given', () => {
    const empty = createBoard();
    const placed = placeShip(empty, FLEET[4], 0, 0, true);
    expect(empty.ships).toHaveLength(0);
    expect(empty.cells[0][0].ship).toBe(-1);
    const shot = fire(placed, 0, 0);
    expect(placed.cells[0][0].shot).toBe(false);
    expect(placed.ships[0].hits).toBe(0);
    expect(shot.board.ships[0].hits).toBe(1);
  });
});

describe('battleship firing', () => {
  it('reports miss, hit, sunk, repeat and game over', () => {
    let b = placeShip(createBoard(), FLEET[4], 0, 0, true);
    const miss = fire(b, 5, 5);
    expect(miss.result).toBe('miss');
    b = miss.board;
    const hit = fire(b, 0, 0);
    expect(hit.result).toBe('hit');
    b = hit.board;
    expect(fire(b, 0, 0).result).toBe('repeat');
    const sunk = fire(b, 0, 1);
    expect(sunk.result).toBe('sunk');
    expect(sunk.gameOver).toBe(true);
  });
});

describe('battleship ai', () => {
  it.each(
    ([false, true] as const).flatMap(t => (['easy', 'normal', 'hard'] as AiLevel[]).map(l => [t, l] as const)),
  )('finishes every game within 100 shots (allowTouch=%s, %s)', (allowTouch, level) => {
    const rng = seeded(3);
    for (let g = 0; g < 20; g++) {
      let b = randomFleet(allowTouch, rng);
      let shots = 0;
      let over = false;
      while (!over) {
        const s = aiChooseShot(b, level, allowTouch, rng);
        expect(s).not.toBeNull();
        if (!s) break;
        const res = fire(b, s[0], s[1]);
        expect(res.result).not.toBe('repeat');
        b = res.board;
        over = res.gameOver;
        shots++;
        expect(shots).toBeLessThanOrEqual(100);
      }
    }
  });

  it('plays hard clearly better than easy', () => {
    const avg = (level: AiLevel) => {
      const rng = seeded(5);
      let total = 0;
      for (let g = 0; g < 30; g++) {
        let b = randomFleet(false, rng);
        let over = false;
        while (!over) {
          const s = aiChooseShot(b, level, false, rng);
          if (!s) break;
          const res = fire(b, s[0], s[1]);
          b = res.board;
          over = res.gameOver;
          total++;
        }
      }
      return total / 30;
    };
    expect(avg('hard')).toBeLessThan(avg('easy') - 20);
  });
});
