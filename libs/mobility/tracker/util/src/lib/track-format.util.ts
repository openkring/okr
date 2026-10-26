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

/** A split as m:ss per 500 m, e.g. «2:05 /500 m» (whole seconds). */
export function formatSplit(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} /500 m`;
}

/** A step count with grouped thousands, e.g. «6’240» (de-CH). */
export function formatSteps(steps: number, locale = 'de-CH'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(steps)));
}

/**
 * The activity figures of a section or track as display texts (spec 1.122), in the order steps, average split,
 * best split. Labels carry single-brace placeholders ({steps}, {split}); an absent figure or an empty label is
 * left out, so a legacy track renders nothing.
 */
export function figureTexts(
  f: { steps?: number; splitAvgS?: number; splitBestS?: number },
  labels: { steps: string; splitAvg: string; splitBest: string },
): string[] {
  const out: string[] = [];
  if (f.steps !== undefined && labels.steps) out.push(labels.steps.replace('{steps}', formatSteps(f.steps)));
  if (f.splitAvgS !== undefined && labels.splitAvg) out.push(labels.splitAvg.replace('{split}', formatSplit(f.splitAvgS)));
  if (f.splitBestS !== undefined && labels.splitBest) out.push(labels.splitBest.replace('{split}', formatSplit(f.splitBestS)));
  return out;
}

/** Start time encoded in a calibration file name (`row-<ms>.csv`, spec 1.122 §5.2), as ISO; '' for any other name. */
export function calibrationStartedAt(file: string): string {
  const ms = Number(/row-(\d+)\.csv$/.exec(file)?.[1]);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '';
}
