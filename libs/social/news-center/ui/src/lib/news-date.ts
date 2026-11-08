import { format } from 'date-fns';

/** `dd.MM.yy HH:mm` of an ISO date-time; '' for an undated or unparseable item. */
export function formatNewsDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : format(date, 'dd.MM.yy HH:mm');
}

/** `dd.MM.yy HH:mm:ss` of a capture time. */
export function formatNewsTime(date: Date | null | undefined): string {
  return date && !Number.isNaN(date.getTime()) ? format(date, 'dd.MM.yy HH:mm:ss') : '';
}

/** `m:ss` or `h:mm:ss` of a duration in seconds. */
export function formatNewsDuration(totalSec: number | undefined): string {
  if (!totalSec || totalSec < 0) return '';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Only http(s) URLs from a feed may reach an `src`/`href`. */
export function isHttpUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}
