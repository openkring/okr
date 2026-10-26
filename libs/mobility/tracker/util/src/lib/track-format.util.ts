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

/** A rate or distance with at most one decimal, e.g. «22.4», «31» (de-CH). */
function formatOneDecimal(v: number, locale = 'de-CH'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
}

/**
 * The activity figures of a section or track as display texts (spec 1.122), in the order steps, strokes, average
 * and maximum stroke rate, average and best split, distance per stroke. Labels carry single-brace placeholders
 * ({steps}, {strokes}, {rate}, {split}, {m}); an absent figure or an empty / missing label is left out, so a
 * legacy track renders nothing.
 */
export function figureTexts(
  f: {
    steps?: number; strokes?: number; strokeRateAvg?: number; strokeRateMax?: number;
    splitAvgS?: number; splitBestS?: number; distancePerStrokeM?: number;
  },
  labels: { steps: string; splitAvg: string; splitBest: string; strokes?: string; rateAvg?: string; rateMax?: string; perStroke?: string },
): string[] {
  const out: string[] = [];
  const add = (value: number | undefined, label: string | undefined, key: string, text: (v: number) => string) => {
    if (value !== undefined && label) out.push(label.replace(`{${key}}`, text(value)));
  };
  add(f.steps, labels.steps, 'steps', (v) => formatSteps(v));
  add(f.strokes, labels.strokes, 'strokes', (v) => formatSteps(v));
  add(f.strokeRateAvg, labels.rateAvg, 'rate', (v) => formatOneDecimal(v));
  add(f.strokeRateMax, labels.rateMax, 'rate', (v) => formatOneDecimal(v));
  add(f.splitAvgS, labels.splitAvg, 'split', (v) => formatSplit(v));
  add(f.splitBestS, labels.splitBest, 'split', (v) => formatSplit(v));
  add(f.distancePerStrokeM, labels.perStroke, 'm', (v) => formatOneDecimal(v));
  return out;
}

/** Start time encoded in a calibration file name (`row-<ms>.csv`, spec 1.122 §5.2), as ISO; '' for any other name. */
export function calibrationStartedAt(file: string): string {
  const ms = Number(/row-(\d+)\.csv$/.exec(file)?.[1]);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '';
}
