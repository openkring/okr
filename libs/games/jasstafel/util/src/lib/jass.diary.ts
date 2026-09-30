import { AvatarInfo } from '@okr/shared-models';

import { stats, totals, winner } from './jass.engine';
import { formatDuration, jassTiming } from './jass.timing';
import { JassGame, JassSide } from './jass.types';

/** Resolved i18n strings the diary line is built from. */
export interface JassDiaryLabels {
  prefix: string;
  variant: string;
  winner: string;
  draw: string;
  weis: string;
  matches: string;
  hands: string;
}

const firstName = (a: AvatarInfo) => (a.name1 || a.name2 || a.label || '?').trim();
const sideNames = (game: JassGame, side: JassSide) => side.playerIdx.map(i => firstName(game.players[i].avatar)).join(' & ');

/**
 * The one line a finished game leaves in the diary (spec 1.67 §11), e.g.
 * «Jass Schieber: Anna & Clara 2530 : 1870 Beat & Dora · Gewonnen: Anna & Clara · Weis 340 : 120 ·
 * Match 3 : 0 · 12 Runden · 1 h 25 min». '' while the game is still running.
 */
export function jassDiaryLine(game: JassGame, labels: JassDiaryLabels): string {
  const outcome = winner(game);
  if (outcome === undefined) return '';
  const sum = totals(game);
  const st = stats(game);
  const per = (f: (s: JassSide) => string | number) => game.sides.map(f).join(' : ');
  const won = game.sides.find(s => s.id === outcome);
  const parts = [
    `${labels.prefix} ${labels.variant}: ${per(s => `${sideNames(game, s)} ${sum[s.id] ?? 0}`)}`,
    won ? `${labels.winner}: ${sideNames(game, won)}` : labels.draw,
    `${labels.weis} ${per(s => st[s.id]?.weis ?? 0)}`,
    `${labels.matches} ${per(s => st[s.id]?.matches ?? 0)}`,
    `${game.hands.length} ${labels.hands}`,
  ];
  const duration = formatDuration(jassTiming(game).minutes);
  if (duration) parts.push(duration);
  return parts.join(' · ');
}

/** The diary day of a game: the StoreDate part of when it finished; '' while it runs. */
export function jassDiaryDate(game: JassGame): string {
  return game.finishedAt ? game.finishedAt.substring(0, 8) : '';
}
