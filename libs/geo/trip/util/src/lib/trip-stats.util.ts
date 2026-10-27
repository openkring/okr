import { TRACKER_TRIP_TYPE, TripModel } from '@okr/shared-models';

/** 0 = the whole year ('Alle'), 1–4 = Q1–Q4. */
export type Quarter = 0 | 1 | 2 | 3 | 4;

/** Trip-stats entries keyed by boat or person okey — the shape of a `stats_rollup` document's `entries`. */
export type TripStatsEntries = Record<string, { km: number; count: number }>;

/**
 * Only trips in these states count toward the stats. Mirrors COUNTING_STATES in
 * apps/functions/src/trip/index.ts, which builds the yearly rollups — keep the two in sync.
 * 'open'/'open.rev' are still on the water; a plain 'deleted' trip no longer counts.
 */
export const TRIP_COUNTING_STATES: ReadonlySet<string> = new Set([
  'closed',
  'closed.rev',
  'deleted.corr',
  'deleted.corr.rev',
]);

/**
 * The StoreDate range ('yyyyMMdd', both ends inclusive) of one quarter of a year.
 * Quarter 0 returns the whole year.
 */
export function getQuarterDateRange(year: number, quarter: Quarter): { from: string; to: string } {
  if (quarter === 0) return { from: `${year}0101`, to: `${year}1231` };
  const firstMonth = (quarter - 1) * 3 + 1;
  const lastMonth  = firstMonth + 2;
  return {
    from: `${year}${String(firstMonth).padStart(2, '0')}01`,
    // the 31st works as an inclusive upper bound for every month: StoreDates compare as strings
    to:   `${year}${String(lastMonth).padStart(2, '0')}31`,
  };
}

/**
 * Sums km and trip count per boat or per participant, with the same rules the Cloud Function
 * applies to the yearly rollup: tracker trips and non-counting states are skipped, and so is a
 * trip whose distance is not a number.
 */
export function aggregateTripStats(trips: TripModel[], entityType: 'boats' | 'members'): TripStatsEntries {
  const entries: TripStatsEntries = {};
  const add = (key: string | undefined, km: number): void => {
    if (!key) return;
    const cur = entries[key] ?? { km: 0, count: 0 };
    entries[key] = { km: cur.km + km, count: cur.count + 1 };
  };

  for (const trip of trips) {
    if (trip.type === TRACKER_TRIP_TYPE || !TRIP_COUNTING_STATES.has(trip.state)) continue;
    const km = Number(trip.distance);
    if (!Number.isFinite(km)) continue;

    if (entityType === 'boats') {
      add(trip.resource?.key, km);
    } else {
      for (const p of trip.participants ?? []) add(p.key, km);
    }
  }
  return entries;
}
