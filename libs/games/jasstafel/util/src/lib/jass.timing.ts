import { DateFormat, convertDateFormatToString, parseDate } from '@okr/shared-util-core';

import { JassGame } from './jass.types';

export interface JassTiming {
  /** dd.MM.yyyy, '' if unreadable */
  date: string;
  /** HH:mm */
  start: string;
  /** HH:mm, '' while the game runs */
  end: string;
  /** whole minutes from start to end; undefined while the game runs */
  minutes: number | undefined;
}

const read = (v: string | undefined) => (v ? parseDate(v, DateFormat.StoreDateTime, false) : null);
const show = (v: string, to: DateFormat) => convertDateFormatToString(v, DateFormat.StoreDateTime, to, false);

/** Date, start, end and duration of a game; times are stored as local StoreDateTime. */
export function jassTiming(game: JassGame): JassTiming {
  const started = read(game.startedAt);
  if (!started) return { date: '', start: '', end: '', minutes: undefined };
  const finished = read(game.finishedAt);
  return {
    date: show(game.startedAt, DateFormat.ViewDate),
    start: show(game.startedAt, DateFormat.Time),
    end: finished && game.finishedAt ? show(game.finishedAt, DateFormat.Time) : '',
    minutes: finished ? Math.max(0, Math.round((finished.getTime() - started.getTime()) / 60000)) : undefined,
  };
}

/** «45 min», «1 h 35 min»; '' when there is no duration yet. */
export function formatDuration(minutes: number | undefined): string {
  if (minutes === undefined) return '';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
