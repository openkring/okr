import { isNextDay } from './wordle.daily';
import { gameStatus } from './wordle.engine';
import { WordleGame, WordleStats } from './wordle.types';

export function emptyStats(): WordleStats {
  return { played: 0, won: 0, streak: 0, maxStreak: 0, dist: {} };
}

/**
 * Adds one FINISHED round to its bucket's statistics. Call it exactly once per round, when the
 * round ends; a round still being played returns the stats unchanged.
 *
 * Streaks: an endless streak counts consecutive wins. A daily streak additionally needs the
 * rounds on consecutive calendar days — a win after a skipped day starts again at 1.
 */
export function recordResult(stats: WordleStats, game: WordleGame): WordleStats {
  const status = gameStatus(game);
  if (status === 'playing') return stats;

  const won = status === 'won';
  const continues = game.mode === 'endless'
    || (stats.lastDay !== undefined && game.day !== undefined && isNextDay(stats.lastDay, game.day));
  const streak = won ? (continues ? stats.streak + 1 : 1) : 0;
  const dist = { ...stats.dist };
  if (won) dist[game.guesses.length] = (dist[game.guesses.length] ?? 0) + 1;

  return {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    streak,
    maxStreak: Math.max(stats.maxStreak, streak),
    dist,
    ...(game.mode === 'daily' ? { lastDay: game.day } : stats.lastDay !== undefined ? { lastDay: stats.lastDay } : {}),
  };
}

/** Win rate as a whole percentage; 0 before the first round. */
export function winRate(stats: WordleStats): number {
  return stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100);
}

/**
 * The daily streak as it stands TODAY: a streak whose last round is older than yesterday is
 * already broken, even though nothing has been recorded since.
 */
export function currentStreak(stats: WordleStats, today: string, mode: 'daily' | 'endless'): number {
  if (mode === 'endless' || stats.lastDay === undefined) return stats.streak;
  return stats.lastDay === today || isNextDay(stats.lastDay, today) ? stats.streak : 0;
}
