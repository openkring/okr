import { describe, expect, it } from 'vitest';

import { MAZE, MAZE_ROWS, isOpen, parseMaze, tileAt } from './mampf.maze';

describe('mampf maze', () => {
  it('is 28 × 31 with 250 dots, 4 pellets and one tunnel row', () => {
    expect(MAZE.width).toBe(28);
    expect(MAZE.height).toBe(31);
    expect(MAZE.dotCount).toBe(250);
    expect(MAZE.pelletCount).toBe(4);
    expect(MAZE.tunnelRows).toEqual([14]);
  });

  it('is mirror-symmetric', () => {
    for (const row of MAZE_ROWS) expect(row).toBe([...row].reverse().join(''));
  });

  it('has no dead ends and every open tile is reachable from the hero start', () => {
    const open = (x: number, y: number) => isOpen(tileAt(MAZE, x, y));
    const neighbours = (x: number, y: number) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy] as const)
        .filter(([nx, ny]) => open(nx, ny));
    let total = 0;
    for (let y = 0; y < MAZE.height; y++) {
      for (let x = 0; x < MAZE.width; x++) {
        if (!open(x, y)) continue;
        total++;
        expect(neighbours(x, y).length, `dead end at ${x},${y}`).toBeGreaterThanOrEqual(2);
      }
    }
    const seen = new Set<string>();
    const todo: [number, number][] = [[13, 23]];
    while (todo.length) {
      const [x, y] = todo.pop()!;
      const key = `${(x + 28) % 28},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const [nx, ny] of neighbours(x, y)) todo.push([(nx + 28) % 28, ny]);
    }
    expect(seen.size).toBe(total);
  });

  it('wraps columns and treats rows outside the maze as wall', () => {
    expect(tileAt(MAZE, -1, 14)).toBe('T');
    expect(tileAt(MAZE, 28, 14)).toBe('T');
    expect(tileAt(MAZE, 5, -1)).toBe('#');
    expect(tileAt(MAZE, 5, 31)).toBe('#');
  });

  it('rejects ragged rows and unknown characters', () => {
    expect(() => parseMaze([])).toThrow();
    expect(() => parseMaze(['###', '##'])).toThrow(/row 1/);
    expect(() => parseMaze(['#x#'])).toThrow(/unknown/);
  });
});
