import { GhostId, Tile } from './mampf.types';

/**
 * Mampf's own maze — 28 × 31 tiles, mirror-symmetric, no dead ends.
 *
 * `#` wall · `.` dot · `o` power pellet · ` ` empty corridor · `-` ghost-house door ·
 * `H` ghost-house interior · `T` tunnel end (wraps to the other side).
 *
 * The start positions are NOT marked in the map: the hero and the ghosts start between two
 * tiles (x = 13.5), which a single character cannot express. See `HERO_START`/`GHOST_START`.
 */
export const MAZE_ROWS: readonly string[] = [
  '############################',
  '#..........................#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.#####.##.#####.######',
  '######.#####.##.#####.######',
  '######.##          ##.######',
  '######.## ###--### ##.######',
  '######.## #HHHHHH# ##.######',
  'T         #HHHHHH#         T',
  '######.## #HHHHHH# ##.######',
  '######.## ######## ##.######',
  '######.##          ##.######',
  '######.## ######## ##.######',
  '######.## ######## ##.######',
  '#..........................#',
  '#.####.##############.####.#',
  '#o####.##############.####o#',
  '#............  ............#',
  '####.#.###.######.###.#.####',
  '####.#.###.######.###.#.####',
  '#............##............#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];

export const DOT = 1;
export const PELLET = 2;

export interface Maze {
  width: number;
  height: number;
  rows: readonly string[];
  /** Initial dots, one cell per tile (`row * width + col`): 0 none, `DOT`, `PELLET`. */
  dots: Uint8Array;
  dotCount: number;
  pelletCount: number;
  /** Rows that carry a `T` tunnel end. */
  tunnelRows: number[];
}

const ALLOWED = /^[#.o \-HT]+$/;

/** Parses a tile map; throws on ragged rows or unknown characters. */
export function parseMaze(rows: readonly string[]): Maze {
  if (rows.length === 0) throw new Error('mampf maze: no rows');
  const width = rows[0].length;
  const dots = new Uint8Array(width * rows.length);
  let dotCount = 0;
  let pelletCount = 0;
  const tunnelRows: number[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`mampf maze: row ${y} has ${row.length} columns, expected ${width}`);
    if (!ALLOWED.test(row)) throw new Error(`mampf maze: row ${y} has an unknown character`);
    if (row.includes('T')) tunnelRows.push(y);
    for (let x = 0; x < width; x++) {
      if (row[x] === '.') { dots[y * width + x] = DOT; dotCount++; }
      if (row[x] === 'o') { dots[y * width + x] = PELLET; pelletCount++; }
    }
  });
  return { width, height: rows.length, rows, dots, dotCount, pelletCount, tunnelRows };
}

export const MAZE: Maze = parseMaze(MAZE_ROWS);

/** The character at a tile; columns wrap (tunnel), rows outside the maze read as wall. */
export function tileAt(maze: Maze, col: number, row: number): string {
  if (row < 0 || row >= maze.height) return '#';
  const c = ((col % maze.width) + maze.width) % maze.width;
  return maze.rows[row][c];
}

/** Open for the hero and for roaming ghosts: everything but walls and the ghost house. */
export function isOpen(ch: string): boolean {
  return ch !== '#' && ch !== '-' && ch !== 'H';
}

export const HERO_START = { x: 13.5, y: 23 } as const;
export const GHOST_START: Record<GhostId, { x: number; y: number }> = {
  chaser: { x: 13.5, y: 11 },
  ambusher: { x: 13.5, y: 14 },
  fickle: { x: 11.5, y: 14 },
  shy: { x: 15.5, y: 14 },
};
/** Where a leaving ghost steps out (above the door) and where eyes head for. */
export const DOOR_EXIT = { x: 13.5, y: 11 } as const;
export const HOUSE_CENTRE = { x: 13.5, y: 14 } as const;
/** The tile eaten eyes target; reaching it (or its twin at column 14) starts `entering`. */
export const DOOR_TILE: Tile = [13, 11];

/** Scatter targets lie outside the maze, beyond each corner. */
export const SCATTER_CORNER: Record<GhostId, Tile> = {
  chaser: [25, -3],
  ambusher: [2, -3],
  fickle: [27, 31],
  shy: [0, 31],
};

/** The tunnel's slow stretch: row 14, columns 0–5 and 22–27. */
export function inTunnel(x: number, y: number): boolean {
  return Math.round(y) === 14 && (x < 5.5 || x > 21.5);
}
