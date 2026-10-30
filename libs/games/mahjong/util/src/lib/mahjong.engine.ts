/*
 * Mahjong solitaire: match pairs of identical free tiles until the stack is cleared.
 *
 * Board geometry is in half-tile units: a tile at (x, y) covers x..x+2 and y..y+2 on layer z, so
 * neighbours and stacked tiles may be offset by half a tile. A tile is free when no tile on a
 * higher layer overlaps it and its left or right side is open.
 *
 * Deals are always solvable: `deal` plays the empty layout forwards, taking a random free pair of
 * positions at each step, and only then writes a matching pair of kinds onto each pair of
 * positions. That removal order is a solution by construction. `reshuffle` does the same for the
 * tiles still on the board.
 */

export const MAHJONG_LAYOUTS = ['pagoda', 'towers', 'pyramid'] as const;
export type MahjongLayout = (typeof MAHJONG_LAYOUTS)[number];

export type Slot = { x: number; y: number; z: number };

export type Suit = 'dot' | 'bam' | 'char' | 'wind' | 'dragon' | 'flower' | 'season';

export type TileKind = {
  id: string;
  suit: Suit;
  /** 1–9 for the three number suits, 1–4 for flowers and seasons, 0 otherwise. */
  rank: number;
  /** Tiles with the same group match: the kind itself, or every flower / every season. */
  group: string;
};

export type MahjongState = {
  layout: MahjongLayout;
  /** One kind id per slot of the layout, in `layoutSlots(layout)` order. */
  kinds: string[];
  /** Whether the tile in that slot is still on the board. */
  alive: boolean[];
  /** Pairs taken so far. */
  moves: number;
  shuffles: number;
};

export const WINDS = ['E', 'S', 'W', 'N'] as const;
export const DRAGONS = ['R', 'G', 'W'] as const;

function buildKinds(): Record<string, TileKind> {
  const out: Record<string, TileKind> = {};
  const add = (k: TileKind): void => { out[k.id] = k; };
  for (const suit of ['dot', 'bam', 'char'] as const) {
    for (let rank = 1; rank <= 9; rank++) add({ id: suit + rank, suit, rank, group: suit + rank });
  }
  for (const w of WINDS) add({ id: 'w' + w, suit: 'wind', rank: 0, group: 'w' + w });
  for (const d of DRAGONS) add({ id: 'd' + d, suit: 'dragon', rank: 0, group: 'd' + d });
  for (let rank = 1; rank <= 4; rank++) {
    add({ id: 'f' + rank, suit: 'flower', rank, group: 'flower' });
    add({ id: 's' + rank, suit: 'season', rank, group: 'season' });
  }
  return out;
}

export const MAHJONG_KINDS: Readonly<Record<string, TileKind>> = buildKinds();

export const isKind = (id: unknown): id is string => typeof id === 'string' && id in MAHJONG_KINDS;

export function matches(a: string, b: string): boolean {
  return MAHJONG_KINDS[a].group === MAHJONG_KINDS[b].group;
}

/* ---------- layouts ---------- */

function rect(out: Slot[], x0: number, y0: number, cols: number, rows: number, z: number): void {
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) out.push({ x: x0 + 2 * c, y: y0 + 2 * r, z });
}

const BUILDERS: Record<MahjongLayout, () => Slot[]> = {
  /** 144 tiles: a rounded base, three shrinking layers and two wings on each side. */
  pagoda: () => {
    const o: Slot[] = [];
    [8, 10, 12, 12, 12, 12, 10, 8].forEach((w, r) => rect(o, 12 - w, 2 * r, w, 1, 0));
    o.push({ x: -2, y: 7, z: 0 }, { x: -4, y: 7, z: 0 }, { x: 24, y: 7, z: 0 }, { x: 26, y: 7, z: 0 });
    rect(o, 6, 2, 6, 6, 1);
    rect(o, 8, 4, 4, 4, 2);
    rect(o, 10, 6, 2, 2, 3);
    return o;
  },
  /** 144 tiles: one wide base with a five-layer tower at each end and two bridge tiles between. */
  towers: () => {
    const o: Slot[] = [];
    rect(o, 0, 0, 14, 6, 0);
    rect(o, 2, 2, 5, 4, 1);
    rect(o, 16, 2, 5, 4, 1);
    o.push({ x: 13, y: 3, z: 1 }, { x: 13, y: 7, z: 1 });
    rect(o, 4, 4, 3, 2, 2);
    rect(o, 18, 4, 3, 2, 2);
    o.push({ x: 5, y: 5, z: 3 }, { x: 7, y: 5, z: 3 }, { x: 19, y: 5, z: 3 }, { x: 21, y: 5, z: 3 });
    o.push({ x: 6, y: 5, z: 4 }, { x: 20, y: 5, z: 4 });
    return o;
  },
  /** 82 tiles: a short game. */
  pyramid: () => {
    const o: Slot[] = [];
    rect(o, 0, 0, 8, 6, 0);
    rect(o, 2, 2, 6, 4, 1);
    rect(o, 4, 4, 4, 2, 2);
    o.push({ x: 6, y: 5, z: 3 }, { x: 8, y: 5, z: 3 });
    return o;
  },
};

const SLOT_CACHE = new Map<MahjongLayout, readonly Slot[]>();

/** The layout's positions, shifted so the smallest x and y are 0. */
export function layoutSlots(layout: MahjongLayout): readonly Slot[] {
  let slots = SLOT_CACHE.get(layout);
  if (!slots) {
    const raw = BUILDERS[layout]();
    const mx = Math.min(...raw.map(s => s.x));
    const my = Math.min(...raw.map(s => s.y));
    slots = raw.map(s => ({ x: s.x - mx, y: s.y - my, z: s.z }));
    SLOT_CACHE.set(layout, slots);
  }
  return slots;
}

/** Board extent in half-tile units, and the highest layer. */
export function layoutBounds(layout: MahjongLayout): { width: number; height: number; layers: number } {
  const slots = layoutSlots(layout);
  return {
    width: Math.max(...slots.map(s => s.x)) + 2,
    height: Math.max(...slots.map(s => s.y)) + 2,
    layers: Math.max(...slots.map(s => s.z)) + 1,
  };
}

/* ---------- rules ---------- */

export function isFreeAt(slots: readonly Slot[], alive: readonly boolean[], i: number): boolean {
  if (!alive[i]) return false;
  const t = slots[i];
  let left = false;
  let right = false;
  for (let j = 0; j < slots.length; j++) {
    if (j === i || !alive[j]) continue;
    const u = slots[j];
    const overlapsY = Math.abs(u.y - t.y) < 2;
    if (u.z > t.z && overlapsY && Math.abs(u.x - t.x) < 2) return false;
    if (u.z === t.z && overlapsY) {
      if (u.x - t.x === -2) left = true;
      else if (u.x - t.x === 2) right = true;
    }
  }
  return !(left && right);
}

export function freeTiles(state: MahjongState): number[] {
  const slots = layoutSlots(state.layout);
  return state.alive.flatMap((_, i) => (isFreeAt(slots, state.alive, i) ? [i] : []));
}

/** Free tiles grouped by what they match; only groups that hold a pair. */
function freeGroups(state: MahjongState): number[][] {
  const groups = new Map<string, number[]>();
  for (const i of freeTiles(state)) {
    const g = MAHJONG_KINDS[state.kinds[i]].group;
    groups.set(g, [...(groups.get(g) ?? []), i]);
  }
  return [...groups.values()].filter(list => list.length > 1);
}

/** How many pairs could be taken right now, counting each free tile once. */
export function openPairs(state: MahjongState): number {
  return freeGroups(state).reduce((n, list) => n + Math.floor(list.length / 2), 0);
}

/** One pair that can be taken now, or null when the board is stuck. */
export function findPair(state: MahjongState): [number, number] | null {
  const list = freeGroups(state)[0];
  return list ? [list[0], list[1]] : null;
}

export function canRemove(state: MahjongState, a: number, b: number): boolean {
  if (a === b) return false;
  const slots = layoutSlots(state.layout);
  return isFreeAt(slots, state.alive, a) && isFreeAt(slots, state.alive, b) && matches(state.kinds[a], state.kinds[b]);
}

/** Takes the pair off the board; returns the same state when the move is not allowed. */
export function removePair(state: MahjongState, a: number, b: number): MahjongState {
  if (!canRemove(state, a, b)) return state;
  const alive = state.alive.slice();
  alive[a] = alive[b] = false;
  return { ...state, alive, moves: state.moves + 1 };
}

export const tilesLeft = (state: MahjongState): number => state.alive.filter(Boolean).length;
export const isCleared = (state: MahjongState): boolean => tilesLeft(state) === 0;

/* ---------- dealing ---------- */

/** Fisher–Yates; `rng` returns a number in [0, 1). */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Picks from `items`, preferring higher layers so that tall stacks are taken down early. */
function pickWeighted(items: readonly number[], slots: readonly Slot[], rng: () => number): number {
  const weights = items.map(i => (slots[i].z + 1) ** 2);
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < items.length; k++) {
    r -= weights[k];
    if (r <= 0) return items[k];
  }
  return items[items.length - 1];
}

/**
 * A removal order of free pairs that clears exactly the slots in `filled`, or null when none was
 * found. Random forward play can dead-end (e.g. one tile left on top of another), so it retries.
 */
export function solvingOrder(slots: readonly Slot[], filled: readonly number[], rng: () => number, attempts = 400): [number, number][] | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const alive = new Array<boolean>(slots.length).fill(false);
    for (const i of filled) alive[i] = true;
    let left = filled.length;
    const order: [number, number][] = [];
    while (left) {
      const free = filled.filter(i => isFreeAt(slots, alive, i));
      if (free.length < 2) break;
      const a = pickWeighted(free, slots, rng);
      const b = pickWeighted(free.filter(i => i !== a), slots, rng);
      alive[a] = alive[b] = false;
      left -= 2;
      order.push([a, b]);
    }
    if (!left) return order;
  }
  return null;
}

/** The full set as matching pairs: two pairs of each ordinary kind, two of flowers, two of seasons. */
export function fullPairs(rng: () => number): [string, string][] {
  const pairs: [string, string][] = [];
  for (const k of Object.values(MAHJONG_KINDS)) {
    if (k.group === k.id) pairs.push([k.id, k.id], [k.id, k.id]);
  }
  const flowers = shuffle(['f1', 'f2', 'f3', 'f4'], rng);
  const seasons = shuffle(['s1', 's2', 's3', 's4'], rng);
  pairs.push([flowers[0], flowers[1]], [flowers[2], flowers[3]], [seasons[0], seasons[1]], [seasons[2], seasons[3]]);
  return shuffle(pairs, rng);
}

function place(kinds: string[], order: readonly [number, number][], pairs: readonly [string, string][]): string[] {
  const out = kinds.slice();
  order.forEach(([a, b], k) => {
    out[a] = pairs[k][0];
    out[b] = pairs[k][1];
  });
  return out;
}

/** A new, solvable game. Layouts with fewer than 144 tiles use a random subset of the pairs. */
export function deal(layout: MahjongLayout, rng: () => number = Math.random): MahjongState {
  const slots = layoutSlots(layout);
  const order = solvingOrder(slots, slots.map((_, i) => i), rng);
  if (!order) throw new Error(`mahjong: no solvable deal found for layout ${layout}`);
  const pairs = fullPairs(rng).slice(0, order.length);
  return {
    layout,
    kinds: place(new Array<string>(slots.length).fill(''), order, pairs),
    alive: slots.map(() => true),
    moves: 0,
    shuffles: 0,
  };
}

/**
 * Rearranges the tiles still on the board into a solvable order; null when no such order was
 * found (it always exists for a full layout, but not necessarily for an arbitrary remnant).
 */
export function reshuffle(state: MahjongState, rng: () => number = Math.random): MahjongState | null {
  const slots = layoutSlots(state.layout);
  const filled = state.alive.flatMap((a, i) => (a ? [i] : []));
  const order = solvingOrder(slots, filled, rng);
  if (!order) return null;
  const groups = new Map<string, string[]>();
  for (const i of filled) {
    const g = MAHJONG_KINDS[state.kinds[i]].group;
    groups.set(g, [...(groups.get(g) ?? []), state.kinds[i]]);
  }
  const pairs: [string, string][] = [];
  for (const list of groups.values()) {
    const mixed = shuffle(list, rng);
    for (let k = 0; k + 1 < mixed.length; k += 2) pairs.push([mixed[k], mixed[k + 1]]);
  }
  return { ...state, kinds: place(state.kinds, order, shuffle(pairs, rng)), shuffles: state.shuffles + 1 };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
