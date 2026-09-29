import { chaseTarget, chooseDir } from './mampf.ghosts';
import {
  BASE_SPEED, DOT_POINTS, DYING_TICKS, EXTRA_LIFE_SCORE, EYES_SPEED, FLASH_TICKS, FRIGHT_SPEED,
  GHOST_POINTS, GLOBAL_RELEASE_DOTS, HOUSE_SPEED, IDLE_RELEASE_TICKS, LEVEL_CLEAR_TICKS, LevelParams,
  PELLET_POINTS, READY_TICKS, RELEASE_DOTS, START_LIVES, TICKS_PER_SECOND, TUNNEL_SPEED, levelParams,
} from './mampf.levels';
import {
  DOOR_EXIT, DOOR_TILE, DOT, GHOST_START, HERO_START, HOUSE_CENTRE, MAZE, SCATTER_CORNER,
  inTunnel, isOpen, tileAt,
} from './mampf.maze';
import { nextRandom } from './mampf.rng';
import {
  Actor, DIR_VEC, DIRS, Dir, GHOST_IDS, GameState, Ghost, GhostId, MampfEvent, OPPOSITE, Tile,
} from './mampf.types';

const EPS = 1e-6;
const W = MAZE.width;

const perTick = (factor: number) => (BASE_SPEED * factor) / TICKS_PER_SECOND;
const wrapCol = (col: number) => ((col % W) + W) % W;

/** A fresh game at level 1, in `ready`. The seed drives the frightened ghosts' random turns. */
export function newGame(seed: number): GameState {
  const state: GameState = {
    status: 'ready',
    statusTicks: READY_TICKS,
    level: 1,
    score: 0,
    lives: START_LIVES,
    extraLifeGiven: false,
    hero: { x: HERO_START.x, y: HERO_START.y, dir: 'left', want: null, travelled: 0 },
    ghosts: [],
    dots: MAZE.dots.slice(),
    dotsLeft: MAZE.dotCount + MAZE.pelletCount,
    dotsEatenLevel: 0,
    globalRelease: false,
    globalDots: 0,
    idleTicks: 0,
    modeIndex: 0,
    modeTicks: 0,
    frightTicks: 0,
    combo: 0,
    seed: seed | 0,
  };
  resetActors(state);
  return state;
}

/** Puts hero and ghosts back on their start positions and clears the mode and fright timers. */
export function resetActors(state: GameState): void {
  state.hero = { x: HERO_START.x, y: HERO_START.y, dir: 'left', want: null, travelled: 0 };
  state.ghosts = GHOST_IDS.map(id => ({
    id,
    x: GHOST_START[id].x,
    y: GHOST_START[id].y,
    dir: id === 'chaser' ? 'left' : 'up',
    state: id === 'chaser' ? 'active' : 'house',
    frightened: false,
  }));
  state.modeIndex = 0;
  state.modeTicks = 0;
  state.frightTicks = 0;
  state.combo = 0;
  state.idleTicks = 0;
}

export function ghostMode(state: GameState): 'scatter' | 'chase' {
  return state.modeIndex % 2 === 0 ? 'scatter' : 'chase';
}

/** True during the last `FLASH_TICKS` of a fright. */
export function isFlashing(state: GameState): boolean {
  return state.frightTicks > 0 && state.frightTicks <= FLASH_TICKS;
}

export function tileOf(a: Actor): Tile {
  return [wrapCol(Math.round(a.x)), Math.round(a.y)];
}

export function ghostById(state: GameState, id: GhostId): Ghost {
  return state.ghosts.find(g => g.id === id)!;
}

/**
 * Advances the game by one tick (1/60 s) and returns what happened in it.
 * `input` is the direction the player currently wants (or `null` for no change).
 */
export function step(state: GameState, input: Dir | null): MampfEvent[] {
  const events: MampfEvent[] = [];
  switch (state.status) {
    case 'ready':
      if (input) state.hero.want = input;
      if (--state.statusTicks <= 0) state.status = 'playing';
      break;
    case 'playing':
      play(state, input, events);
      break;
    case 'dying':
      if (--state.statusTicks <= 0) afterDeath(state, events);
      break;
    case 'levelClear':
      if (--state.statusTicks <= 0) nextLevel(state);
      break;
    case 'gameOver':
      break;
  }
  return events;
}

function play(state: GameState, input: Dir | null, events: MampfEvent[]): void {
  const params = levelParams(state.level);
  const hero = state.hero;
  if (input) {
    hero.want = input;
    // the hero may turn around anywhere, not only at a tile centre
    if (input === OPPOSITE[hero.dir]) hero.dir = input;
  }
  hero.travelled += moveActor(hero, perTick(params.heroSpeed), () => heroTurn(state));
  eat(state, params, events);
  if (state.status !== 'playing') return;
  updateTimers(state, params, events);
  releaseGhosts(state);
  for (const ghost of state.ghosts) moveGhost(state, ghost, params);
  collide(state, events);
}

/**
 * Moves an actor `dist` tiles along its direction. At every tile centre it passes, `atCentre`
 * decides the next direction; `null` stops the actor there. Columns wrap through the tunnel.
 * Returns the distance actually moved.
 */
export function moveActor(actor: Actor, dist: number, atCentre: () => Dir | null): number {
  let left = dist;
  let moved = 0;
  while (left > EPS) {
    const horizontal = actor.dir === 'left' || actor.dir === 'right';
    const pos = horizontal ? actor.x : actor.y;
    const forward = actor.dir === 'right' || actor.dir === 'down';
    let toCentre: number;
    if (Math.abs(pos - Math.round(pos)) < EPS) {
      if (horizontal) actor.x = Math.round(actor.x);
      else actor.y = Math.round(actor.y);
      const next = atCentre();
      if (next === null) break;
      actor.dir = next;
      toCentre = 1;
    } else {
      toCentre = forward ? Math.ceil(pos) - pos : pos - Math.floor(pos);
    }
    const len = Math.min(left, toCentre);
    const [dx, dy] = DIR_VEC[actor.dir];
    actor.x += dx * len;
    actor.y += dy * len;
    left -= len;
    moved += len;
    if (actor.x < -0.5) actor.x += W;
    else if (actor.x >= W - 0.5) actor.x -= W;
  }
  return moved;
}

function canEnter(col: number, row: number, dir: Dir): boolean {
  const [dx, dy] = DIR_VEC[dir];
  return isOpen(tileAt(MAZE, col + dx, row + dy));
}

function heroTurn(state: GameState): Dir | null {
  const hero = state.hero;
  const [col, row] = tileOf(hero);
  if (hero.want && canEnter(col, row, hero.want)) return hero.want;
  if (canEnter(col, row, hero.dir)) return hero.dir;
  return null;
}

function addScore(state: GameState, points: number, events: MampfEvent[]): void {
  state.score += points;
  if (!state.extraLifeGiven && state.score >= EXTRA_LIFE_SCORE) {
    state.extraLifeGiven = true;
    state.lives++;
    events.push({ type: 'extraLife' });
  }
}

function eat(state: GameState, params: LevelParams, events: MampfEvent[]): void {
  const [col, row] = tileOf(state.hero);
  const idx = row * W + col;
  const kind = state.dots[idx];
  if (!kind) return;
  state.dots[idx] = 0;
  state.dotsLeft--;
  state.dotsEatenLevel++;
  state.idleTicks = 0;
  if (state.globalRelease) state.globalDots++;
  if (kind === DOT) {
    addScore(state, DOT_POINTS, events);
    events.push({ type: 'dot' });
  } else {
    addScore(state, PELLET_POINTS, events);
    events.push({ type: 'pellet' });
    frighten(state, params);
  }
  if (state.dotsLeft === 0) {
    state.status = 'levelClear';
    state.statusTicks = LEVEL_CLEAR_TICKS;
    events.push({ type: 'levelClear' });
  }
}

function frighten(state: GameState, params: LevelParams): void {
  state.combo = 0;
  for (const g of state.ghosts) {
    if (g.state !== 'active') continue;
    g.dir = OPPOSITE[g.dir];
    if (params.frightSeconds > 0) g.frightened = true;
  }
  if (params.frightSeconds > 0) state.frightTicks = params.frightSeconds * TICKS_PER_SECOND;
}

function updateTimers(state: GameState, params: LevelParams, events: MampfEvent[]): void {
  state.idleTicks++;
  if (state.frightTicks > 0) {
    // the scatter/chase clock stands still while the ghosts are frightened
    if (--state.frightTicks === 0) {
      for (const g of state.ghosts) g.frightened = false;
      events.push({ type: 'frightEnd' });
    }
    return;
  }
  if (++state.modeTicks >= params.schedule[state.modeIndex] * TICKS_PER_SECOND) {
    state.modeIndex++;
    state.modeTicks = 0;
    for (const g of state.ghosts) if (g.state === 'active') g.dir = OPPOSITE[g.dir];
    events.push({ type: 'modeChange' });
  }
}

const RELEASE_ORDER = ['ambusher', 'fickle', 'shy'] as const;

function releaseGhosts(state: GameState): void {
  const next = RELEASE_ORDER.map(id => state.ghosts.find(g => g.id === id)).find(g => g?.state === 'house');
  if (!next) return;
  const id = next.id as (typeof RELEASE_ORDER)[number];
  const due = state.globalRelease
    ? state.globalDots >= GLOBAL_RELEASE_DOTS[id]
    : state.dotsEatenLevel >= RELEASE_DOTS[id];
  if (due || state.idleTicks >= IDLE_RELEASE_TICKS) {
    next.state = 'leaving';
    state.idleTicks = 0;
  }
}

/** Walks a ghost straight to `to`, x first, then y. Returns true on arrival. */
function walkTo(g: Ghost, to: { x: number; y: number }, dist: number): boolean {
  let left = dist;
  if (Math.abs(g.x - to.x) > EPS) {
    const len = Math.min(left, Math.abs(to.x - g.x));
    g.dir = to.x > g.x ? 'right' : 'left';
    g.x += Math.sign(to.x - g.x) * len;
    left -= len;
  }
  if (left > EPS && Math.abs(g.y - to.y) > EPS) {
    const len = Math.min(left, Math.abs(to.y - g.y));
    g.dir = to.y > g.y ? 'down' : 'up';
    g.y += Math.sign(to.y - g.y) * len;
  }
  return Math.abs(g.x - to.x) < EPS && Math.abs(g.y - to.y) < EPS;
}

function moveGhost(state: GameState, g: Ghost, params: LevelParams): void {
  switch (g.state) {
    case 'house':
      return;
    case 'leaving':
      if (walkTo(g, DOOR_EXIT, perTick(HOUSE_SPEED))) {
        g.x = DOOR_EXIT.x;
        g.y = DOOR_EXIT.y;
        g.state = 'active';
        g.dir = 'left';
      }
      return;
    case 'entering':
      if (walkTo(g, HOUSE_CENTRE, perTick(EYES_SPEED))) g.state = 'leaving';
      return;
  }
  const factor = g.state === 'eaten' ? EYES_SPEED
    : inTunnel(g.x, g.y) ? TUNNEL_SPEED
      : g.frightened ? FRIGHT_SPEED
        : params.ghostSpeed;
  moveActor(g, perTick(factor), () => ghostTurn(state, g));
}

function ghostTurn(state: GameState, g: Ghost): Dir | null {
  const [col, row] = tileOf(g);
  if (g.state === 'eaten' && row === DOOR_TILE[1] && (col === DOOR_TILE[0] || col === DOOR_TILE[0] + 1)) {
    g.state = 'entering';
    return null;
  }
  const options = DIRS.filter(d => d !== OPPOSITE[g.dir] && canEnter(col, row, d));
  if (options.length === 0) return OPPOSITE[g.dir];
  if (g.frightened) return options[Math.floor(nextRandom(state) * options.length)];
  return chooseDir(options, [col, row], targetOf(state, g));
}

/** The tile a roaming ghost is heading for right now. */
export function targetOf(state: GameState, g: Ghost): Tile {
  if (g.state === 'eaten') return DOOR_TILE;
  if (ghostMode(state) === 'scatter') return SCATTER_CORNER[g.id];
  const hero = state.hero;
  return chaseTarget(g.id, tileOf(hero), hero.dir, tileOf(g), tileOf(ghostById(state, 'chaser')));
}

function collide(state: GameState, events: MampfEvent[]): void {
  const hero = state.hero;
  for (const g of state.ghosts) {
    if (g.state !== 'active') continue;
    const dx = Math.abs(g.x - hero.x);
    const dist = Math.min(dx, W - dx) + Math.abs(g.y - hero.y);
    if (dist >= 0.5) continue;
    if (g.frightened) {
      g.frightened = false;
      g.state = 'eaten';
      const points = GHOST_POINTS[Math.min(state.combo, GHOST_POINTS.length - 1)];
      state.combo++;
      addScore(state, points, events);
      events.push({ type: 'ghostEaten', points });
    } else {
      state.status = 'dying';
      state.statusTicks = DYING_TICKS;
      state.lives--;
      events.push({ type: 'died' });
      return;
    }
  }
}

function afterDeath(state: GameState, events: MampfEvent[]): void {
  if (state.lives <= 0) {
    state.status = 'gameOver';
    events.push({ type: 'gameOver' });
    return;
  }
  resetActors(state);
  state.globalRelease = true;
  state.globalDots = 0;
  state.status = 'ready';
  state.statusTicks = READY_TICKS;
}

function nextLevel(state: GameState): void {
  state.level++;
  state.dots = MAZE.dots.slice();
  state.dotsLeft = MAZE.dotCount + MAZE.pelletCount;
  state.dotsEatenLevel = 0;
  state.globalRelease = false;
  state.globalDots = 0;
  resetActors(state);
  state.status = 'ready';
  state.statusTicks = READY_TICKS;
}
