import { AvatarInfo } from '@okr/shared-models';

export type JassVariant = 'schieber' | 'bueter' | 'coiffeur' | 'differenzler';
export const JASS_VARIANTS: JassVariant[] = ['schieber', 'bueter', 'coiffeur', 'differenzler'];

/** The seven trump modes of Schieber and Büter. Coiffeur uses its own row ids instead. */
export type JassTrump = 'eicheln' | 'schellen' | 'schilten' | 'rosen' | 'obenabe' | 'undenufe' | 'slalom';
export const JASS_TRUMPS: JassTrump[] = ['eicheln', 'schellen', 'schilten', 'rosen', 'obenabe', 'undenufe', 'slalom'];

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
  /** Schilten and Schellen count 2× */
  suitsDouble: boolean;
  /** Obenabe and Undenufe count 3× */
  topDownTriple: boolean;
  /** Slalom counts 4× */
  slalomQuad: boolean;
  coiffeurRows: CoiffeurRow[];
  differenzlerHands: number;
}

export interface JassPlayer { avatar: AvatarInfo; }

/** A scoring side: a team, the Büter, the pair, or one Differenzler player. */
export interface JassSide { id: string; playerIdx: number[]; target?: number; }

export interface JassHand {
  trumpMakerIdx: number;
  /** a JassTrump, or a Coiffeur row id */
  trump: string;
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
  startedAt: string;
  finishedAt?: string;
}

/** a side id, 'draw', or undefined while the game is running */
export type JassOutcome = string | undefined;

export interface JassSideStats {
  hands: number;
  pointsPlayed: number;
  weis: number;
  stoeck: number;
  matches: number;
  average: number;
}

export interface JassStrokes { hundreds: number; fifties: number; twenties: number; rest: number; }
