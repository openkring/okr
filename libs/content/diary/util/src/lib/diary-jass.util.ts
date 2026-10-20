/**
 * A Jass result as the Jasstafel writes it into the diary's `events` (spec 1.67 §11, built by
 * `jassDiaryLine` in @okr/games-jasstafel-util), read back for the result card. The line is the
 * only thing stored, so it is parsed by its shape — the labels are in the player's language:
 * «Jass Schieber: Anna & Clara 2530 : Beat & Dora 1870 · Gewonnen: Anna & Clara ·
 * Weis (mit Stöck) 340 : 120 · Match 3 : 0 · 12 Runden · 1 h 25 min».
 */
export interface JassDiaryResult {
  variant: string;
  sides: { names: string; score: number; weis: number; matches: number; isWinner: boolean }[];
  isDraw: boolean;
  weisLabel: string;
  matchesLabel: string;
  /** e.g. '12 Runden' */
  handsLabel: string;
  /** e.g. '1 h 25 min'; '' when the game had no timing */
  duration: string;
}

/** How the game went, for the card's tagline. */
export type JassVerdict = 'draw' | 'match' | 'close' | 'clear' | 'rout';

const JASS_PREFIX = 'Jass ';
const SEP = ' · ';
/** «Weis (mit Stöck) 340 : 120» — a label (may hold spaces), then one number per side */
const PER_SIDE = /^(.+?) (-?\d+(?: : -?\d+)+)$/;
const SIDE_SCORE = /^(.*\S)\s+(-?\d+)$/;
const HANDS = /^\d+ \S.*$/;

function perSide(part: string | undefined, count: number): { label: string; values: number[] } | undefined {
  const m = part?.match(PER_SIDE);
  if (!m) return undefined;
  const values = m[2].split(' : ').map(Number);
  return values.length === count ? { label: m[1], values } : undefined;
}

/** The parsed result, or undefined when `line` is not a Jasstafel line. */
export function parseJassDiaryLine(line: string): JassDiaryResult | undefined {
  if (!line.startsWith(JASS_PREFIX)) return undefined;
  const parts = line.split(SEP);
  if (parts.length < 5 || parts.length > 6) return undefined;

  const head = parts[0].slice(JASS_PREFIX.length);
  const colon = head.indexOf(': ');
  if (colon <= 0) return undefined;
  const variant = head.slice(0, colon);
  const sides = head.slice(colon + 2).split(' : ').map(s => s.match(SIDE_SCORE));
  if (sides.length < 2 || sides.some(s => !s)) return undefined;

  const weis = perSide(parts[2], sides.length);
  const matches = perSide(parts[3], sides.length);
  if (!weis || !matches || !HANDS.test(parts[4])) return undefined;

  const winColon = parts[1].indexOf(': ');
  const winnerNames = winColon > 0 ? parts[1].slice(winColon + 2) : '';
  return {
    variant,
    sides: sides.map((m, i) => {
      const names = (m as RegExpMatchArray)[1];
      return { names, score: Number((m as RegExpMatchArray)[2]), weis: weis.values[i], matches: matches.values[i], isWinner: names === winnerNames };
    }),
    isDraw: !winnerNames,
    weisLabel: weis.label,
    matchesLabel: matches.label,
    handsLabel: parts[4],
    duration: parts[5] ?? '',
  };
}

/**
 * The tagline category: a draw; a win with a Match; else by the margin between the winner and the
 * best other side, relative to the larger score (works for Differenzler, where low wins, too).
 */
export function jassVerdict(result: JassDiaryResult): JassVerdict {
  const winner = result.sides.find(s => s.isWinner);
  if (result.isDraw || !winner) return 'draw';
  if (winner.matches > 0) return 'match';
  const others = result.sides.filter(s => s !== winner).map(s => s.score);
  const best = others.reduce((a, b) => (Math.abs(winner.score - b) < Math.abs(winner.score - a) ? b : a), others[0]);
  const top = Math.max(Math.abs(winner.score), Math.abs(best), 1);
  const margin = Math.abs(winner.score - best) / top;
  if (margin < 0.05) return 'close';
  return margin > 0.4 ? 'rout' : 'clear';
}

/** «Schneider»: a beaten side with less than half the winner's points (only where high wins). */
export function isJassSchneider(result: JassDiaryResult, sideIndex: number): boolean {
  const winner = result.sides.find(s => s.isWinner);
  const side = result.sides[sideIndex];
  if (!winner || !side || side === winner || winner.score <= 0) return false;
  return winner.score > side.score && side.score < winner.score / 2;
}

/**
 * Chalk strokes on the Z of a Swiss Jasstafel: hundreds on the top bar, fifties as crosses on the
 * diagonal, twenties on the bottom bar; what is left is written as a small number.
 */
export function jassTally(score: number): { hundreds: number; fifties: number; twenties: number; rest: number } {
  if (score <= 0) return { hundreds: 0, fifties: 0, twenties: 0, rest: Math.max(0, score) };
  const hundreds = Math.floor(score / 100);
  const fifties = Math.floor((score % 100) / 50);
  const twenties = Math.floor((score % 50) / 20);
  return { hundreds, fifties, twenties, rest: score % 50 % 20 };
}
