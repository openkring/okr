import { AvatarInfo } from '@okr/shared-models';

export type JassVariant = 'schieber' | 'bueter' | 'coiffeur' | 'differenzler';
export const JASS_VARIANTS: JassVariant[] = ['schieber', 'bueter', 'coiffeur', 'differenzler'];

/** Schieber and Büter: the multiplier is entered with the points of each hand (owner ruling 2026-09-29). */
export const JASS_MULTIPLIERS = [1, 2, 3, 4, 5];

export const CARD_POINTS = 157;
export const MATCH_POINTS = 257;
export const STOECK_POINTS = 20;

/** Seats per variant; Differenzler is played by three or four. */
export const PLAYER_COUNTS: Record<JassVariant, number[]> = {
  schieber: [4], bueter: [3], coiffeur: [4], differenzler: [3, 4],
};

export interface CoiffeurRow { id: string; label: string; multiplier: number; }

export interface JassConfig {
  schieberTarget: number;
  bueterPairTarget: number;
  /** the Büter's bid, set on the start screen (default 650) */
  bueterBid: number;
  coiffeurRows: CoiffeurRow[];
  differenzlerHands: number;
}

export interface JassPlayer { avatar: AvatarInfo; }

/** A scoring side: a team, the Büter, the pair, or one Differenzler player. */
export interface JassSide { id: string; playerIdx: number[]; target?: number; }

export interface JassHand {
  trumpMakerIdx: number;
  /** Coiffeur: the row id; '' for every other variant */
  trump: string;
  /** Schieber/Büter: 1..5, entered with the points; missing = 1 */
  multiplier?: number;
  /** Coiffeur: the team that played the row */
  sideId?: string;
  /** card points per side id, before multiplier; ignored for the sides of a Match */
  cardPoints: Record<string, number>;
  weis: Record<string, number>;
  stoeckSideId?: string;
  matchSideId?: string;
  /** Differenzler only */
  announced?: Record<string, number>;
}

/** Schieber/Büter: a stroke chalked by tapping a line of the Z — Weis (Stöck included), never multiplied. */
export type JassChalkUnit = 100 | 50 | 20;
export const JASS_CHALK_UNITS: JassChalkUnit[] = [100, 50, 20];

export interface JassChalk {
  sideId: string;
  unit: JassChalkUnit;
  /** how many hands had been entered when the stroke was tapped — keeps taps and hands in order */
  afterHand: number;
}

export interface JassGame {
  id: string;
  variant: JassVariant;
  /** frozen copy taken at game start */
  config: JassConfig;
  players: JassPlayer[];
  sides: JassSide[];
  bid?: number;
  bueterIdx?: number;
  hands: JassHand[];
  /** tapped strokes; missing on games stored before 2026-09-29 */
  chalks?: JassChalk[];
  startedAt: string;
  finishedAt?: string;
}

/** a side id, 'draw', or undefined while the game is running */
export type JassOutcome = string | undefined;

export interface JassSideStats {
  hands: number;
  pointsPlayed: number;
  /** Weis entered with a hand, Stöck and tapped strokes */
  weis: number;
  matches: number;
  average: number;
}

export interface JassStrokes { hundreds: number; fifties: number; twenties: number; rest: number; }
