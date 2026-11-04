import { BaseProperty, EnergyFiguresModel, EnergyMonth, EnergyTariff } from '@okr/shared-models';
import {
  DateFormat, LOCATION_BFS_STATUS_NONE, LOCATION_PROPERTY_BFS_STATUS, convertDateFormatToString,
  getBfsNr, getDayDiff, getLocationProperty
} from '@okr/shared-util-core';

export type EnergySectionState = 'noLocation' | 'preparing' | 'noData' | 'ready';

/** The part of a LocationModel this lib needs; keeps the util free of the full model. */
export type LocationLike = { properties?: BaseProperty[] };

/**
 * The four ElCom components of a tariff, the marker for a not yet valid year and the unit of the
 * y-axis, already translated. The unit is a label because fr, es and it write «ct./kWh», not «Rp./kWh».
 */
export interface TariffLabels { energy: string; gridUsage: string; charge: string; aidFee: string; future: string; unit: string; }

/** Energie Reporter is monthly: a snapshot older than this many days is shown with its age. */
export const ENERGY_STALE_DAYS = 45;

/** A comparison shows at most this many locations beside the main one. */
export const MAX_COMPARE_KEYS = 4;

/**
 * What the section shows. Figures win: a document that exists is ready, whatever `bfsStatus` says.
 * Without figures, the job's status counts only while it was written for the CURRENT number
 * (or is `none`, which names no number): after someone fixes a wrong BFS number the old status
 * is stale and the section goes back to «preparing» until the next run.
 */
export function energySectionState(location: LocationLike | undefined, figures: EnergyFiguresModel | undefined): EnergySectionState {
  if (figures) return 'ready';
  if (!location) return 'noLocation';
  const status = getLocationProperty(location, LOCATION_PROPERTY_BFS_STATUS);
  if (status === undefined || status === '') return 'preparing';
  if (status === LOCATION_BFS_STATUS_NONE) return 'noData';
  const bfsNr = getBfsNr(location);
  return bfsNr !== undefined && String(status).trim() === String(bfsNr) ? 'noData' : 'preparing';
}

/**
 * The newest non-null value of one field and the date of THAT row. A tile carries the date of its
 * own value: the newest month may have no value for this field while an older one has. Zero is a value.
 */
export function latestValue(months: EnergyMonth[], field: keyof EnergyMonth): { value: number; date: string } | undefined {
  let best: { value: number; date: string } | undefined;
  for (const month of months ?? []) {
    const value = month[field];
    if (typeof value !== 'number') continue;
    if (!best || month.date > best.date) best = { value, date: month.date };
  }
  return best;
}

export interface TariffRange { year: number; min: number; max: number; isFallback: boolean; }

/**
 * The tariff people pay now: the rows of the calendar year, as a min–max range over all operators
 * (ElCom has no volumes, so no average would be honest). ElCom publishes next year's tariffs months
 * ahead, so a published future year is not the current tariff. Before the year is published
 * (January) the newest earlier year stands in, marked `isFallback`. Never a future year.
 */
export function currentTariff(tariffs: EnergyTariff[], calendarYear: number): TariffRange | undefined {
  const rows = tariffs ?? [];
  const exact = rows.filter((t) => t.year === calendarYear);
  if (exact.length > 0) return range(calendarYear, exact, false);
  const earlier = rows.filter((t) => t.year < calendarYear).map((t) => t.year);
  if (earlier.length === 0) return undefined;
  const year = Math.max(...earlier);
  return range(year, rows.filter((t) => t.year === year), true);
}

function range(year: number, rows: EnergyTariff[], isFallback: boolean): TariffRange {
  const totals = rows.map((t) => t.total);
  return { year, min: Math.min(...totals), max: Math.max(...totals), isFallback };
}

/** The network operators of the newest year in the data, distinct and sorted. */
export function operatorNames(tariffs: EnergyTariff[]): string[] {
  const rows = tariffs ?? [];
  if (rows.length === 0) return [];
  const newest = Math.max(...rows.map((t) => t.year));
  return [...new Set(rows.filter((t) => t.year === newest).map((t) => t.operatorName))].sort((a, b) => a.localeCompare(b));
}

/**
 * One row per distinct period end, oldest first. The consumption and production figures are
 * 12-month totals that lag the snapshot, so 68 monthly snapshots hold only 33 periods; plotting
 * every snapshot would draw the same value repeatedly.
 */
export function distinctPeriods(months: EnergyMonth[], until: 'elecPeriodUntil' | 'productionPeriodUntil'): EnergyMonth[] {
  const seen = new Map<string, EnergyMonth>();
  for (const month of months ?? []) {
    const end = month[until];
    if (end && !seen.has(end)) seen.set(end, month);
  }
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, month]) => month);
}

/**
 * Whether a snapshot is older than `days` (Energie Reporter is monthly). `sourceDate` is a StoreDate;
 * both sides are compared as calendar days, and `now` counts as its UTC day so the answer does not
 * depend on the machine's time zone. An empty or unreadable date is not reported as stale.
 */
export function isStale(sourceDate: string, now: Date, days = ENERGY_STALE_DAYS): boolean {
  if (!sourceDate) return false;
  const today = convertDateFormatToString(now.toISOString().substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
  const age = getDayDiff(sourceDate, today);
  return age >= 0 && age >= days;
}

/**
 * The Energie Reporter site. CC BY 4.0 requires the attribution to link to it, so the sources block
 * takes the address from here instead of from a translation that a tenant could override.
 */
export const ENERGY_REPORTER_URL = 'https://www.energiereporter.ch';

/** The BFE solar-potential document of a municipality. */
export function solarDocumentUrl(bfsNr: number): string {
  return `https://www.uvek-gis.admin.ch/BFE/storymaps/ECH_SolarpotGemeinden/pdf/${bfsNr}.pdf`;
}

/** The comparison locations: without the main one, without duplicates, in order, at most four. */
export function uniqueCompareKeys(locationKey: string, compareKeys: string[]): string[] {
  const keys = (compareKeys ?? []).filter((key) => key && key !== locationKey);
  return [...new Set(keys)].slice(0, MAX_COMPARE_KEYS);
}

/** One row of the comparison table: relative figures only, since absolute ones just show a municipality's size. */
export interface EnergyCompareRow {
  name: string;
  bfsNr: number | undefined;
  solarPotentialUsage: number | undefined;
  renewableHeatingShare: number | undefined;
  electricCarShare: number | undefined;
  elecPerCapitaMwh: number | undefined;
  tariff: TariffRange | undefined;
}

/** A location without figures still gives a row (all values undefined) so the rest of the table renders. */
export function compareRow(name: string, figures: EnergyFiguresModel | undefined, calendarYear: number): EnergyCompareRow {
  const months = figures?.months ?? [];
  return {
    name,
    bfsNr: figures?.bfsNr,
    solarPotentialUsage: latestValue(months, 'solarPotentialUsage')?.value,
    renewableHeatingShare: latestValue(months, 'renewableHeatingShare')?.value,
    electricCarShare: latestValue(months, 'electricCarShare')?.value,
    elecPerCapitaMwh: latestValue(months, 'elecPerCapitaMwh')?.value,
    tariff: currentTariff(figures?.tariffs ?? [], calendarYear)
  };
}

// Swiss number format: decimal point, one decimal. Built once; Intl is expensive to construct.
const ONE_DECIMAL = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const WHOLE_NUMBER = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });

/**
 * A share as percent with one decimal («7.8 %»). Energie Reporter stores shares as fractions
 * (0.078), so the value is multiplied by 100. A missing value gives `undefined`, never «0 %»:
 * the caller shows its own «no data» text. Zero is a value.
 */
export function formatShare(fraction: number | null | undefined): string | undefined {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return undefined;
  return `${ONE_DECIMAL.format(fraction * 100)} %`;
}

/**
 * A tariff range as "min–max" (en dash), or one value when min equals max. The unit is not part of
 * it: the table's column header names it. No tariff gives `undefined`.
 */
export function formatTariffRange(range: TariffRange | undefined): string | undefined {
  if (!range) return undefined;
  const min = ONE_DECIMAL.format(range.min);
  const max = ONE_DECIMAL.format(range.max);
  return min === max ? min : `${min}\u2013${max}`;
}

/** A tariff cell of the comparison: the range, and the year when it stands in for the current one. */
export function formatCompareTariff(range: TariffRange | undefined): string | undefined {
  const text = formatTariffRange(range);
  return text !== undefined && range?.isFallback ? `${text} (${range.year})` : text;
}

/** A whole number with thousands separators («72’527»), for counts and MWh. Missing gives `undefined`. */
export function formatCount(value: number | null | undefined): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return WHOLE_NUMBER.format(value);
}

/** A plain figure with one decimal («2.4»), for values that are not shares. Missing gives `undefined`. */
export function formatDecimal(value: number | null | undefined): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return ONE_DECIMAL.format(value);
}
