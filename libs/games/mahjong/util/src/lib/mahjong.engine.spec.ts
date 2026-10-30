import { describe, expect, it } from 'vitest';

import {
  MAHJONG_KINDS,
  MAHJONG_LAYOUTS,
  MahjongState,
  canRemove,
  deal,
  findPair,
  formatDuration,
  freeTiles,
  isCleared,
  isFreeAt,
  layoutBounds,
  layoutSlots,
  matches,
  openPairs,
  removePair,
  reshuffle,
  solvingOrder,
  tilesLeft,
} from './mahjong.engine';

/** A seeded generator (mulberry32), so a failing deal can be replayed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const groupCounts = (kinds: string[], alive?: boolean[]): Map<string, number> => {
  const out = new Map<string, number>();
  kinds.forEach((k, i) => {
    if (alive && !alive[i]) return;
    const g = MAHJONG_KINDS[k].group;
    out.set(g, (out.get(g) ?? 0) + 1);
  });
  return out;
};

describe('tile kinds', () => {
  it('has 42 kinds: 27 suited, 4 winds, 3 dragons, 4 flowers, 4 seasons', () => {
    expect(Object.keys(MAHJONG_KINDS)).toHaveLength(42);
  });

  it('matches identical kinds, and any flower with any flower', () => {
    expect(matches('dot3', 'dot3')).toBe(true);
    expect(matches('dot3', 'bam3')).toBe(false);
    expect(matches('f1', 'f4')).toBe(true);
    expect(matches('s2', 's3')).toBe(true);
    expect(matches('f1', 's1')).toBe(false);
  });
});

describe('layouts', () => {
  it.each([['pagoda', 144], ['towers', 144], ['pyramid', 82]] as const)('%s has %i tiles', (layout, n) => {
    expect(layoutSlots(layout)).toHaveLength(n);
  });

  it.each(MAHJONG_LAYOUTS)('%s has no two tiles in the same place on one layer', layout => {
    const slots = layoutSlots(layout);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i], b = slots[j];
        const overlap = a.z === b.z && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
        expect(overlap, `${i} and ${j}`).toBe(false);
      }
    }
  });

  it.each(MAHJONG_LAYOUTS)('%s rests every raised tile on the layer below', layout => {
    const slots = layoutSlots(layout);
    for (const t of slots.filter(s => s.z > 0)) {
      const below = slots.filter(u => u.z === t.z - 1 && Math.abs(u.x - t.x) < 2 && Math.abs(u.y - t.y) < 2);
      expect(below.length, JSON.stringify(t)).toBeGreaterThan(0);
    }
  });

  it('is normalised to start at 0, 0', () => {
    for (const layout of MAHJONG_LAYOUTS) {
      const slots = layoutSlots(layout);
      expect(Math.min(...slots.map(s => s.x))).toBe(0);
      expect(Math.min(...slots.map(s => s.y))).toBe(0);
    }
    expect(layoutBounds('pyramid')).toEqual({ width: 16, height: 12, layers: 4 });
  });
});

describe('free tiles', () => {
  // three in a row on layer 0, one on top of the middle one
  const slots = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }];

  it('frees the ends of a row and blocks the middle', () => {
    const alive = [true, true, true, false];
    expect([0, 1, 2].map(i => isFreeAt(slots, alive, i))).toEqual([true, false, true]);
  });

  it('blocks a tile with another on top of it', () => {
    const alive = [false, true, false, true];
    expect(isFreeAt(slots, alive, 1)).toBe(false);
    expect(isFreeAt(slots, alive, 3)).toBe(true);
  });

  it('counts a half-offset neighbour as a side neighbour', () => {
    const s = [{ x: 0, y: 1, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 1, z: 0 }];
    expect(isFreeAt(s, [true, true, true], 1)).toBe(false);
  });

  it('never calls a removed tile free', () => {
    expect(isFreeAt(slots, [false, true, true, true], 0)).toBe(false);
  });
});

describe('deal', () => {
  it.each(MAHJONG_LAYOUTS)('%s deals every tile as part of a matching pair', layout => {
    const state = deal(layout, seeded(7));
    expect(state.kinds.every(k => k in MAHJONG_KINDS)).toBe(true);
    for (const n of groupCounts(state.kinds).values()) expect(n % 2).toBe(0);
    expect(tilesLeft(state)).toBe(layoutSlots(layout).length);
  });

  it('uses the full set on a 144-tile layout: four of each kind, each flower and season once', () => {
    const counts = new Map<string, number>();
    for (const k of deal('pagoda', seeded(3)).kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
    expect(counts.get('dot5')).toBe(4);
    expect(counts.get('wN')).toBe(4);
    expect(counts.get('f2')).toBe(1);
    expect(counts.get('s4')).toBe(1);
  });

  it('opens with at least one pair to take', () => {
    for (let seed = 1; seed <= 10; seed++) expect(findPair(deal('towers', seeded(seed)))).not.toBeNull();
  });

  it.each(MAHJONG_LAYOUTS)('%s finds a removal order that takes only free tiles and clears the board', layout => {
    const slots = layoutSlots(layout);
    for (let seed = 1; seed <= 5; seed++) {
      const order = solvingOrder(slots, slots.map((_, i) => i), seeded(seed));
      expect(order).not.toBeNull();
      const alive = slots.map(() => true);
      for (const [a, b] of order ?? []) {
        expect(isFreeAt(slots, alive, a) && isFreeAt(slots, alive, b)).toBe(true);
        alive[a] = alive[b] = false;
      }
      expect(alive.some(Boolean)).toBe(false);
    }
  });
});

describe('moves', () => {
  const tiny = (): MahjongState => deal('pyramid', seeded(11));

  it('takes a matching free pair and counts the move', () => {
    const state = tiny();
    const [a, b] = findPair(state) ?? [-1, -1];
    const next = removePair(state, a, b);
    expect(next.alive[a] || next.alive[b]).toBe(false);
    expect(next.moves).toBe(1);
    expect(tilesLeft(next)).toBe(80);
  });

  it('refuses a blocked tile, a mismatched pair and the same tile twice', () => {
    const state = tiny();
    const free = new Set(freeTiles(state));
    const blocked = state.kinds.findIndex((_, i) => !free.has(i));
    const partner = state.kinds.findIndex((k, i) => i !== blocked && matches(k, state.kinds[blocked]) && free.has(i));
    if (partner >= 0) expect(canRemove(state, blocked, partner)).toBe(false);
    const [a] = findPair(state) ?? [-1];
    const other = [...free].find(i => !matches(state.kinds[i], state.kinds[a]));
    if (other !== undefined) expect(removePair(state, a, other)).toBe(state);
    expect(canRemove(state, a, a)).toBe(false);
  });

  it('counts open pairs once per free tile', () => {
    const state: MahjongState = { ...tiny() };
    expect(openPairs(state)).toBeGreaterThan(0);
    expect(openPairs({ ...state, alive: state.alive.map(() => false) })).toBe(0);
  });

  it('is cleared when no tile is left', () => {
    const state = tiny();
    expect(isCleared(state)).toBe(false);
    expect(isCleared({ ...state, alive: state.alive.map(() => false) })).toBe(true);
  });
});

describe('reshuffle', () => {
  it('keeps the remaining tiles, only in new places, and counts the shuffle', () => {
    let state = deal('pagoda', seeded(5));
    for (let k = 0; k < 10; k++) {
      const pair = findPair(state);
      if (!pair) break;
      state = removePair(state, pair[0], pair[1]);
    }
    const next = reshuffle(state, seeded(9));
    expect(next).not.toBeNull();
    expect(next?.alive).toEqual(state.alive);
    expect(next?.shuffles).toBe(1);
    const before = state.kinds.filter((_, i) => state.alive[i]).sort();
    const after = (next?.kinds ?? []).filter((_, i) => state.alive[i]).sort();
    expect(after).toEqual(before);
  });
});

describe('formatDuration', () => {
  it('shows minutes and seconds, and hours once there are any', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});
