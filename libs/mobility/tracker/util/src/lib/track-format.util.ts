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
