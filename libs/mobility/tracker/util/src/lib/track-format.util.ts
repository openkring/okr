/** Duration as h:mm:ss (hours not padded). */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Distance in km with one decimal, e.g. «1.2 km» (de-CH formatting). */
export function formatKm(meters: number, locale = 'de-CH'): string {
  const km = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.max(0, meters) / 1000);
  return `${km} km`;
}

/** Local wall-clock time (HH:mm) of an ISO timestamp; '' when it cannot be parsed. */
export function formatClockTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
