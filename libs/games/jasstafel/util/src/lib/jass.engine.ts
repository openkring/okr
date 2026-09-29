import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { toStrokes } from './jass.strokes';
import {
  CARD_POINTS, CoiffeurRow, JASS_MULTIPLIERS, JassChalk, JassChalkUnit, JassConfig, JassGame, JassHand, JassOutcome, JassPlayer, JassSide, JassSideStats, JassStrokes,
  JassVariant, MATCH_POINTS, STOECK_POINTS,
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
    startedAt: opts.now ?? getTodayStr(DateFormat.StoreDateTime),
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
  return hand.multiplier ?? 1;
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

function handTotals(game: JassGame): Record<string, number> {
  const sum: Record<string, number> = Object.fromEntries(game.sides.map(s => [s.id, 0]));
  for (const hand of game.hands) {
    const v = slateValues(game, hand);
    for (const id of Object.keys(sum)) sum[id] += v[id] ?? 0;
  }
  return sum;
}

const chalksOf = (game: JassGame, sideId: string): JassChalk[] => (game.chalks ?? []).filter(c => c.sideId === sideId);

/** Always recomputed from the hands and the tapped strokes — never stored. */
export function totals(game: JassGame): Record<string, number> {
  const sum = handTotals(game);
  for (const c of game.chalks ?? []) if (c.sideId in sum) sum[c.sideId] += c.unit;
  return sum;
}

/**
 * What the Z of one side shows: the hand points split the way they are chalked (100s on the top
 * line, one 50 on the diagonal, 20s on the bottom line, the rest as a number), plus every tapped
 * stroke on exactly the line it was tapped on.
 */
export function slateStrokes(game: JassGame, sideId: string): JassStrokes {
  const s = toStrokes(handTotals(game)[sideId] ?? 0);
  for (const c of chalksOf(game, sideId)) {
    if (c.unit === 100) s.hundreds++;
    else if (c.unit === 50) s.fifties++;
    else s.twenties++;
  }
  return s;
}

/**
 * Schieber/Büter: replays the hands and checks each side against its own target after each of the
 * three counting stages Stöck → Weis → cards. Two sides crossing in the same stage: the higher
 * running total wins, then the trump-maker's side.
 */
function raceWinner(game: JassGame): JassOutcome {
  const running: Record<string, number> = Object.fromEntries(game.sides.map(s => [s.id, 0]));
  const target = (id: string) => game.sides.find(s => s.id === id)?.target;
  for (let k = 0; k <= game.hands.length; k++) {
    // strokes tapped before hand k, one at a time
    for (const c of (game.chalks ?? []).filter(x => x.afterHand === k)) {
      if (!(c.sideId in running)) continue;
      running[c.sideId] += c.unit;
      const t = target(c.sideId);
      if (t !== undefined && running[c.sideId] >= t) return c.sideId;
    }
    const hand = game.hands[k];
    if (!hand) break;
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

export function addChalk(game: JassGame, sideId: string, unit: JassChalkUnit): JassGame {
  return { ...game, chalks: [...(game.chalks ?? []), { sideId, unit, afterHand: game.hands.length }] };
}

/** Removes the latest entry — a tapped stroke or a hand, whichever came last. */
export function undoLast(game: JassGame): JassGame {
  const chalks = game.chalks ?? [];
  const last = chalks[chalks.length - 1];
  if (last && last.afterHand >= game.hands.length) return { ...game, chalks: chalks.slice(0, -1), finishedAt: undefined };
  return game.hands.length ? undoHand(game) : game;
}

/** Deletes one hand; strokes tapped after it move up with the hands that follow. */
export function deleteHand(game: JassGame, index: number): JassGame {
  return {
    ...game,
    hands: game.hands.filter((_, i) => i !== index),
    chalks: (game.chalks ?? []).map(c => (c.afterHand > index ? { ...c, afterHand: c.afterHand - 1 } : c)),
    finishedAt: undefined,
  };
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

export function playedRows(game: JassGame, sideId: string, excludeIndex?: number): string[] {
  return game.hands.filter((h, i) => i !== excludeIndex && h.sideId === sideId).map(h => h.trump);
}

export function openRows(game: JassGame, sideId: string, excludeIndex?: number): CoiffeurRow[] {
  const played = new Set(playedRows(game, sideId, excludeIndex));
  return game.config.coiffeurRows.filter(r => !played.has(r.id));
}

const inRange = (v: number | undefined, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

/** Error codes for a hand; an empty list means it may be saved. `excludeIndex` = the hand being edited. */
export function validateHand(game: JassGame, hand: JassHand, excludeIndex?: number): string[] {
  const errors: string[] = [];
  const ids = game.sides.map(s => s.id);

  if (game.variant === 'coiffeur') {
    if (!game.config.coiffeurRows.some(r => r.id === hand.trump)) errors.push('trump_unknown');
    if (!hand.sideId || !ids.includes(hand.sideId)) errors.push('side_missing');
    else if (playedRows(game, hand.sideId, excludeIndex).includes(hand.trump)) errors.push('row_played');
  } else if (game.variant !== 'differenzler' && hand.multiplier !== undefined && !JASS_MULTIPLIERS.includes(hand.multiplier)) {
    errors.push('multiplier_invalid');
  }

  if (hand.matchSideId !== undefined && !ids.includes(hand.matchSideId)) errors.push('match_unknown');
  if (!hand.matchSideId) {
    if (ids.some(id => !inRange(hand.cardPoints[id], CARD_POINTS))) errors.push('points_range');
    else if (ids.reduce((s, id) => s + hand.cardPoints[id], 0) !== CARD_POINTS) errors.push('points_sum');
  }

  if (game.variant === 'differenzler') {
    if (ids.some(id => !inRange(hand.announced?.[id], CARD_POINTS))) errors.push('announce_range');
  } else if (Object.values(hand.weis).some(w => !Number.isInteger(w) || w < 0 || w % 10 !== 0)) {
    errors.push('weis_invalid');
  }
  return errors;
}

export function validateBid(bid: number, config: JassConfig): boolean {
  return Number.isInteger(bid) && bid >= CARD_POINTS && bid <= config.bueterPairTarget && bid % 10 === 0;
}

/**
 * Raw (unmultiplied) figures per side; Coiffeur counts the opponents of a row too. Weis covers
 * Weis entered with a hand, Stöck and every tapped stroke (owner ruling 2026-09-29).
 */
export function stats(game: JassGame): Record<string, JassSideStats> {
  const out: Record<string, JassSideStats> = {};
  for (const side of game.sides) {
    const s = { hands: game.hands.length, pointsPlayed: 0, weis: 0, matches: 0, average: 0 };
    for (const hand of game.hands) {
      s.pointsPlayed += cardPointsOf(hand, side.id);
      s.weis += hand.weis[side.id] ?? 0;
      if (hand.stoeckSideId === side.id) s.weis += STOECK_POINTS;
      if (hand.matchSideId === side.id) s.matches++;
    }
    for (const c of chalksOf(game, side.id)) s.weis += c.unit;
    s.average = s.hands ? Math.round(s.pointsPlayed / s.hands) : 0;
    out[side.id] = s;
  }
  return out;
}
