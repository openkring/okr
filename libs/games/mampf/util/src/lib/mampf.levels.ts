export const TICKS_PER_SECOND = 60;
/** Tiles per second at 100 %. */
export const BASE_SPEED = 9.5;

/** Ghost speed factors that do not depend on the level. */
export const FRIGHT_SPEED = 0.5;
export const TUNNEL_SPEED = 0.4;
export const EYES_SPEED = 1.5;
export const HOUSE_SPEED = 0.5;

export const START_LIVES = 3;
export const EXTRA_LIFE_SCORE = 10_000;
export const DOT_POINTS = 10;
export const PELLET_POINTS = 50;
/** Points for the 1st, 2nd, 3rd and 4th ghost eaten during one fright. */
export const GHOST_POINTS: readonly number[] = [200, 400, 800, 1600];

export const READY_TICKS = 2 * TICKS_PER_SECOND;
export const DYING_TICKS = 1.5 * TICKS_PER_SECOND;
export const LEVEL_CLEAR_TICKS = 2 * TICKS_PER_SECOND;
/** Frightened ghosts flash during the last 2 s. */
export const FLASH_TICKS = 2 * TICKS_PER_SECOND;

/** Dots eaten in the level before each ghost leaves the house (the chaser starts outside). */
export const RELEASE_DOTS = { ambusher: 0, fickle: 30, shy: 60 } as const;
/** After a lost life: dots since the death, shared by all ghosts. */
export const GLOBAL_RELEASE_DOTS = { ambusher: 7, fickle: 17, shy: 32 } as const;
/** No dot eaten for this long releases the next ghost anyway. */
export const IDLE_RELEASE_TICKS = 4 * TICKS_PER_SECOND;

export interface LevelParams {
  /** Fractions of `BASE_SPEED`. */
  heroSpeed: number;
  ghostSpeed: number;
  /** 0 = a pellet only reverses the ghosts. */
  frightSeconds: number;
  /** Scatter/chase phase lengths in seconds, starting with scatter; the last is `Infinity`. */
  schedule: readonly number[];
}

const SCHEDULE_1 = [7, 20, 7, 20, 5, 20, 5, Infinity];
const SCHEDULE_2 = [7, 20, 7, 20, 5, Infinity];
const SCHEDULE_5 = [5, 20, 5, 20, 5, Infinity];

export function levelParams(level: number): LevelParams {
  if (level <= 1) return { heroSpeed: 0.8, ghostSpeed: 0.75, frightSeconds: 6, schedule: SCHEDULE_1 };
  if (level <= 4) return { heroSpeed: 0.9, ghostSpeed: 0.85, frightSeconds: [5, 4, 3][level - 2], schedule: SCHEDULE_2 };
  if (level <= 11) return { heroSpeed: 1, ghostSpeed: 0.95, frightSeconds: 2, schedule: SCHEDULE_5 };
  if (level <= 16) return { heroSpeed: 1, ghostSpeed: 0.95, frightSeconds: 1, schedule: SCHEDULE_5 };
  if (level <= 20) return { heroSpeed: 1, ghostSpeed: 0.95, frightSeconds: 0, schedule: SCHEDULE_5 };
  return { heroSpeed: 0.9, ghostSpeed: 0.95, frightSeconds: 0, schedule: SCHEDULE_5 };
}
