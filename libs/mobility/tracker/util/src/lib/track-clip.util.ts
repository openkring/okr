import { CREW_TRACK_MARGIN_MS, type TripModel } from '@okr/shared-models';
import type { LocalSection } from './track-sections.util';

const ZURICH = 'Europe/Zurich';
const zurichFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZURICH,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Europe/Zurich offset (ms, local minus UTC) at the given instant. */
function zurichOffsetMs(utcMs: number): number {
  const parts: Record<string, number> = {};
  for (const p of zurichFormat.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(parts['year'], parts['month'] - 1, parts['day'], parts['hour'], parts['minute'], parts['second']);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Normalises 'HHmm' / 'HH:mm' / 'Hmm' to 'HH:mm'; '' when there are no digits. */
function normaliseTime(time: string): string {
  const digits = (time ?? '').replace(/\D/g, '').padStart(4, '0').slice(-4);
  return (time ?? '').replace(/\D/g, '') === '' ? '' : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** `yyyyMMdd` + `HH:mm` as a Europe/Zurich wall clock → epoch ms (UTC). Stable across the DST switch. */
export function zurichWallClockMs(storeDate: string, time: string): number {
  const hhmm = normaliseTime(time) || '00:00';
  const naive = Date.UTC(
    Number(storeDate.slice(0, 4)),
    Number(storeDate.slice(4, 6)) - 1,
    Number(storeDate.slice(6, 8)),
    Number(hhmm.slice(0, 2)),
    Number(hhmm.slice(3, 5)),
  );
  const first = naive - zurichOffsetMs(naive);
  return naive - zurichOffsetMs(first);
}

/** The Logbuch window of a trip: start - margin .. end + margin (or `recordingEndMs` when the trip has no end). */
export function logbuchWindowMs(
  trip: Pick<TripModel, 'startDate' | 'startTime' | 'endDate' | 'endTime'>,
  recordingEndMs: number,
): { fromMs: number; toMs: number } {
  const fromMs = zurichWallClockMs(trip.startDate, trip.startTime) - CREW_TRACK_MARGIN_MS;
  const toMs = trip.endDate ? zurichWallClockMs(trip.endDate, trip.endTime) + CREW_TRACK_MARGIN_MS : recordingEndMs;
  return { fromMs, toMs };
}

/**
 * Keeps points and stroke times within [fromMs, toMs]; drops sections left with < 2 points.
 * `steps` is kept only on an unclipped section (a clipped count cannot be apportioned correctly).
 */
export function clipSections(sections: LocalSection[], fromMs: number, toMs: number): LocalSection[] {
  const inRange = (t: number) => t >= fromMs && t <= toMs;
  const out: LocalSection[] = [];
  for (const s of sections) {
    const points = s.points.filter((p) => inRange(p.t));
    if (points.length < 2) continue;
    const clipped = points.length !== s.points.length;
    const next: LocalSection = { ...s, points };
    if (s.strokeTimes) next.strokeTimes = s.strokeTimes.filter(inRange);
    if (clipped) delete next.steps;
    out.push(next);
  }
  return out;
}
