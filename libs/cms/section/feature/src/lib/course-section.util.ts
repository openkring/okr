import type { PublicCourseDate } from '@okr/shared-util-core';

/** ISO `yyyy-MM-dd` as a local calendar day (noon, so DST never shifts it). */
function localDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12);
}

/** Today as ISO `yyyy-MM-dd` on the local calendar. */
export function todayIso(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** A date whose last day lies before today is past. */
export function isPastCourseDate(d: PublicCourseDate, today: string): boolean {
  return (d.endDate || d.date) < today;
}

/**
 * One date line: «Sa, 03.04.2027, 10:00 – 12:00 Uhr · Reservetermin»; full day «Sa, 03.04.2027»;
 * multi-day «Sa, 03.04. – Mo, 05.04.2027». The weekday follows the active language.
 */
export function formatCourseDateLine(d: PublicCourseDate, lang: string): string {
  const wd = new Intl.DateTimeFormat(lang, { weekday: 'short' });
  // some ICU versions print «Sa.» for de; the format is «Sa»
  const weekday = (date: Date) => (lang === 'de' ? wd.format(date).replace(/\.$/, '') : wd.format(date));
  const day = (iso: string, withYear: boolean) => {
    const date = localDay(iso);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${weekday(date)}, ${dd}.${mm}.${withYear ? date.getFullYear() : ''}`;
  };
  let line: string;
  if (d.endDate && d.endDate > d.date) line = `${day(d.date, false)} – ${day(d.endDate, true)}`;
  else line = day(d.date, true);
  if (d.startTime) {
    line += `, ${d.startTime}${d.endTime ? ` – ${d.endTime}` : ''}${lang === 'de' ? ' Uhr' : ''}`;
  }
  if (d.title) line += ` · ${d.title}`;
  return line;
}
