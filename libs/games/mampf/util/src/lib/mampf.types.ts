/** A direction of travel. `DIRS` is also the tie-break order a ghost uses at an intersection. */
export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: readonly Dir[] = ['up', 'left', 'down', 'right'];
export const DIR_VEC: Record<Dir, readonly [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** A tile as `[column, row]`. Targets may lie outside the maze (scatter corners). */
export type Tile = readonly [number, number];

export type GhostId = 'chaser' | 'ambusher' | 'fickle' | 'shy';
export const GHOST_IDS: readonly GhostId[] = ['chaser', 'ambusher', 'fickle', 'shy'];

/**
 * `house` waits inside, `leaving` walks out through the door, `active` roams the maze,
 * `eaten` is a pair of eyes heading for the door, `entering` walks those eyes back inside.
 */
export type GhostState = 'house' | 'leaving' | 'active' | 'eaten' | 'entering';

/** Positions are fractional tile coordinates; a tile's centre is at integer `x`/`y`. */
export interface Actor { x: number; y: number; dir: Dir }

export interface Hero extends Actor {
  /** The direction the player asked for; taken at the next tile centre where it is open. */
  want: Dir | null;
  /** Distance moved since the level started — drives the mouth animation. */
  travelled: number;
}

export interface Ghost extends Actor {
  id: GhostId;
  state: GhostState;
  frightened: boolean;
}

export type EngineStatus = 'ready' | 'playing' | 'dying' | 'levelClear' | 'gameOver';

export type MampfEventType =
  | 'dot' | 'pellet' | 'ghostEaten' | 'extraLife' | 'died'
  | 'levelClear' | 'gameOver' | 'modeChange' | 'frightEnd';

export interface MampfEvent { type: MampfEventType; points?: number }

/** The whole game. `step()` mutates it in place — one object for the whole session. */
export interface GameState {
  status: EngineStatus;
  /** Ticks left in `ready`, `dying` or `levelClear`. */
  statusTicks: number;
  level: number;
  score: number;
  /** Lives including the one being played; 0 means the game is over. */
  lives: number;
  extraLifeGiven: boolean;
  hero: Hero;
  ghosts: Ghost[];
  /** One cell per tile: 0 empty, 1 dot, 2 pellet. */
  dots: Uint8Array;
  dotsLeft: number;
  dotsEatenLevel: number;
  /** After a lost life the ghosts leave the house by a shared dot counter. */
  globalRelease: boolean;
  globalDots: number;
  /** Ticks since the hero last ate a dot. */
  idleTicks: number;
  /** Index into the level's scatter/chase schedule; even = scatter, odd = chase. */
  modeIndex: number;
  modeTicks: number;
  /** Ticks of fright left; 0 = no fright. */
  frightTicks: number;
  /** Ghosts eaten during the current fright. */
  combo: number;
  /** PRNG state (mulberry32). */
  seed: number;
}
