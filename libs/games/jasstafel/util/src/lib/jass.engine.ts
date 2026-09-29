import { trumpMultiplier } from './jass.config';
import {
  JassConfig, JassGame, JassHand, JassOutcome, JassPlayer, JassSide, JassVariant, MATCH_POINTS, STOECK_POINTS,
} from './jass.types';

export function buildSides(variant: JassVariant, playerCount: number, config: JassConfig, bid?: number, bueterIdx = 0): JassSide[] {
  switch (variant) {
    case 'schieber':
      return [
        { id: 'a', playerIdx: [0, 2], target: config.schieberTarget },
        { id: 'b', playerIdx: [1, 3], target: config.schieberTarget },
      ];
    case 'coiffeur':
      return [{ id: 'a', playerIdx: [0, 2] }, { id: 'b', playerIdx: [1, 3] }];
    case 'bueter':
      return [
        { id: 'bueter', playerIdx: [bueterIdx], target: bid ?? config.bueterPairTarget },
        { id: 'pair', playerIdx: [0, 1, 2].filter(i => i !== bueterIdx), target: config.bueterPairTarget },
      ];
    case 'differenzler':
      return Array.from({ length: playerCount }, (_, i) => ({ id: 'p' + i, playerIdx: [i] }));
  }
}

export function createGame(
  variant: JassVariant, players: JassPlayer[], config: JassConfig,
  opts: { bid?: number; bueterIdx?: number; id?: string; now?: string } = {},
): JassGame {
  return {
    id: opts.id ?? globalThis.crypto.randomUUID(),
    variant,
    config: structuredClone(config),
    players,
    sides: buildSides(variant, players.length, config, opts.bid, opts.bueterIdx),
    bid: variant === 'bueter' ? opts.bid : undefined,
    bueterIdx: variant === 'bueter' ? (opts.bueterIdx ?? 0) : undefined,
    hands: [],
    startedAt: opts.now ?? new Date().toISOString(),
  };
}

export function sideOfPlayer(game: JassGame, playerIdx: number): string {
  return game.sides.find(s => s.playerIdx.includes(playerIdx))?.id ?? game.sides[0].id;
}

/** The trump-maker rotates seat by seat, each hand, starting with seat 0. */
export function nextTrumpMaker(game: JassGame): number {
  return game.hands.length % game.players.length;
}

export function handMultiplier(game: JassGame, hand: JassHand): number {
  if (game.variant === 'differenzler') return 1;
  if (game.variant === 'coiffeur') return game.config.coiffeurRows.find(r => r.id === hand.trump)?.multiplier ?? 1;
  return trumpMultiplier(hand.trump, game.config);
}

export function cardPointsOf(hand: JassHand, sideId: string): number {
  if (hand.matchSideId) return hand.matchSideId === sideId ? MATCH_POINTS : 0;
  return hand.cardPoints[sideId] ?? 0;
}

/**
 * The value of one hand per side. Schieber/Büter/Coiffeur: (cards + Weis + Stöck) × multiplier —
 * Weis and Stöck are multiplied with the cards (owner ruling 2026-09-29). Differenzler: the
 * penalty |announced − actual|, never multiplied, Weis and Stöck ignored.
 */
export function handValues(game: JassGame, hand: JassHand): Record<string, number> {
  const out: Record<string, number> = {};
  const m = handMultiplier(game, hand);
  for (const side of game.sides) {
    if (game.variant === 'differenzler') {
      out[side.id] = Math.abs((hand.announced?.[side.id] ?? 0) - cardPointsOf(hand, side.id));
    } else {
      const stoeck = hand.stoeckSideId === side.id ? STOECK_POINTS : 0;
      out[side.id] = (cardPointsOf(hand, side.id) + (hand.weis[side.id] ?? 0) + stoeck) * m;
    }
  }
  return out;
}

/** What a hand writes onto the slate: in Coiffeur only the row's team scores. */
function slateValues(game: JassGame, hand: JassHand): Record<string, number> {
  const v = handValues(game, hand);
  if (game.variant !== 'coiffeur') return v;
  return Object.fromEntries(game.sides.map(s => [s.id, s.id === hand.sideId ? v[s.id] : 0]));
}

/** Always recomputed from the list of hands — never stored. */
export function totals(game: JassGame): Record<string, number> {
  const sum: Record<string, number> = Object.fromEntries(game.sides.map(s => [s.id, 0]));
  for (const hand of game.hands) {
    const v = slateValues(game, hand);
    for (const id of Object.keys(sum)) sum[id] += v[id] ?? 0;
  }
  return sum;
}

/**
 * Schieber/Büter: replays the hands and checks each side against its own target after each of the
 * three counting stages Stöck → Weis → cards. Two sides crossing in the same stage: the higher
 * running total wins, then the trump-maker's side.
 */
function raceWinner(game: JassGame): JassOutcome {
  const running: Record<string, number> = Object.fromEntries(game.sides.map(s => [s.id, 0]));
  for (const hand of game.hands) {
    const m = handMultiplier(game, hand);
    const stages: ((id: string) => number)[] = [
      id => (hand.stoeckSideId === id ? STOECK_POINTS * m : 0),
      id => (hand.weis[id] ?? 0) * m,
      id => cardPointsOf(hand, id) * m,
    ];
    for (const stage of stages) {
      const crossed: string[] = [];
      for (const side of game.sides) {
        running[side.id] += stage(side.id);
        if (side.target !== undefined && running[side.id] >= side.target) crossed.push(side.id);
      }
      if (crossed.length === 1) return crossed[0];
      if (crossed.length > 1) {
        const best = Math.max(...crossed.map(id => running[id]));
        const leaders = crossed.filter(id => running[id] === best);
        if (leaders.length === 1) return leaders[0];
        const makerSide = sideOfPlayer(game, hand.trumpMakerIdx);
        return leaders.includes(makerSide) ? makerSide : leaders[0];
      }
    }
  }
  return undefined;
}

function bestOf(sums: Record<string, number>, direction: 'max' | 'min'): JassOutcome {
  const entries = Object.entries(sums).sort((x, y) => (direction === 'max' ? y[1] - x[1] : x[1] - y[1]));
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return 'draw';
  return entries[0]?.[0];
}

export function winner(game: JassGame): JassOutcome {
  switch (game.variant) {
    case 'schieber':
    case 'bueter':
      return raceWinner(game);
    case 'coiffeur': {
      const cells = game.config.coiffeurRows.length * game.sides.length;
      return game.hands.filter(h => h.sideId).length >= cells ? bestOf(totals(game), 'max') : undefined;
    }
    case 'differenzler':
      return game.hands.length >= game.config.differenzlerHands ? bestOf(totals(game), 'min') : undefined;
  }
}

export function addHand(game: JassGame, hand: JassHand): JassGame {
  return { ...game, hands: [...game.hands, hand] };
}

export function undoHand(game: JassGame): JassGame {
  return { ...game, hands: game.hands.slice(0, -1), finishedAt: undefined };
}

export function replaceHand(game: JassGame, index: number, hand: JassHand): JassGame {
  return { ...game, hands: game.hands.map((h, i) => (i === index ? hand : h)), finishedAt: undefined };
}
