// Pure logic of the nightly energy-figures job (spec 1.136, §5.2–§5.3), kept apart from the runner
// so it can be tested without the scheduler and without the network.
//
// The column names, the SPARQL variable names and the `identify` fields below are assumptions about
// other people's data until something runs them against a real payload: the fixtures next to this file
// are such payloads (captured 2026-11-04). A wrong name yields a silent null, not an error, which is
// why the header is asserted before any row is read.
import { BaseProperty } from '@okr/shared-models';
import type { EnergyMonth, EnergyTariff } from '@okr/shared-models';
import {
  DateFormat, LOCATION_BFS_STATUS_NONE, LOCATION_PROPERTY_BFS_STATUS, convertDateFormatToString, getBfsNr, getLocationProperty,
} from '@okr/shared-util-core';

/** A downloaded ZIP is refetched only when the document is this old (spec §5.3, step 3). */
const REFETCH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/* ------------------------------ Energie Reporter CSV ------------------------------ */

/** Every column `rowToMonth` reads, plus the identifying ones. A missing one is an error: a renamed column must not blank the page. */
export const ENERGY_REPORTER_COLUMNS: readonly string[] = [
  'bfs_nr', 'municipality', 'canton', 'energyreporter_date',
  'electric_car_count', 'electric_car_share', 'electric_car_charging_spot_count',
  'solar_power_installed_kwp', 'solar_potential_usage',
  'renewable_heating_share', 'renewable_heating_count', 'non_renewable_heating_count',
  'elec_consumption_date_from', 'elec_consumption_date_until',
  'renelec_production_date_from', 'renelec_production_date_until',
  'elec_consumption_mwh_per_year', 'elec_consumption_households_mwh_per_year', 'elec_consumption_mwh_per_year_per_capita',
  'renelec_production_mwh_per_year', 'renelec_production_solar_mwh_per_year', 'renelec_production_water_mwh_per_year',
  'renelec_production_wind_mwh_per_year', 'renelec_production_biomass_mwh_per_year', 'renelec_production_waste_mwh_per_year',
];

/** The header line as column names; a leading byte order mark is dropped, so the first column still matches. */
export function parseHeader(line: string): string[] {
  return parseCsvLine(line.replace(/^﻿/, '')).map((name) => name.trim());
}

/** Throws naming the first expected column that the header lacks. */
export function assertEnergyReporterHeader(header: string[]): void {
  const missing = ENERGY_REPORTER_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length > 0) throw new Error(`Energie Reporter CSV: missing column(s) ${missing.join(', ')}`);
}

/** Splits one CSV line; a quoted field may contain commas and a doubled quote stands for one quote. No multi-line fields. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/** Empty or missing is null, never 0: «no figure» must not read as «zero». A real 0 stays 0. */
function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Energie Reporter dates are ISO (`2026-10-31`); the model stores StoreDate. Empty is null. */
function storeDateOrNull(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') return null;
  return convertDateFormatToString(value.trim(), DateFormat.IsoDate, DateFormat.StoreDate);
}

/** One CSV row, keyed by header name, as a monthly figure. */
export function rowToMonth(row: Record<string, string>): EnergyMonth {
  return {
    date: convertDateFormatToString(row['energyreporter_date']?.trim(), DateFormat.IsoDate, DateFormat.StoreDate),
    electricCarCount: numberOrNull(row['electric_car_count']),
    electricCarShare: numberOrNull(row['electric_car_share']),
    chargingSpotCount: numberOrNull(row['electric_car_charging_spot_count']),
    solarKwp: numberOrNull(row['solar_power_installed_kwp']),
    solarPotentialUsage: numberOrNull(row['solar_potential_usage']),
    renewableHeatingShare: numberOrNull(row['renewable_heating_share']),
    renewableHeatingCount: numberOrNull(row['renewable_heating_count']),
    nonRenewableHeatingCount: numberOrNull(row['non_renewable_heating_count']),
    elecPeriodFrom: storeDateOrNull(row['elec_consumption_date_from']),
    elecPeriodUntil: storeDateOrNull(row['elec_consumption_date_until']),
    productionPeriodFrom: storeDateOrNull(row['renelec_production_date_from']),
    productionPeriodUntil: storeDateOrNull(row['renelec_production_date_until']),
    elecConsumptionMwh: numberOrNull(row['elec_consumption_mwh_per_year']),
    elecConsumptionHouseholdsMwh: numberOrNull(row['elec_consumption_households_mwh_per_year']),
    elecPerCapitaMwh: numberOrNull(row['elec_consumption_mwh_per_year_per_capita']),
    renewableProductionMwh: numberOrNull(row['renelec_production_mwh_per_year']),
    solarProductionMwh: numberOrNull(row['renelec_production_solar_mwh_per_year']),
    hydroProductionMwh: numberOrNull(row['renelec_production_water_mwh_per_year']),
    windProductionMwh: numberOrNull(row['renelec_production_wind_mwh_per_year']),
    biomassProductionMwh: numberOrNull(row['renelec_production_biomass_mwh_per_year']),
    wasteProductionMwh: numberOrNull(row['renelec_production_waste_mwh_per_year']),
  };
}

/* ------------------------------ BFS lookup from coordinates ------------------------------ */

/**
 * The current BFS number out of a swisstopo `identify` answer (geojson format). The answer lists every
 * historic year of the municipality; only the row with `is_current_jahr === true` counts.
 * Undefined when there is no such row, i.e. the point is not in a Swiss municipality.
 */
export function currentBfsFromLookup(response: unknown): number | undefined {
  const results = (response as { results?: unknown } | null | undefined)?.results;
  if (!Array.isArray(results)) return undefined;
  for (const entry of results) {
    const props = (entry as { properties?: { is_current_jahr?: unknown; gde_nr?: unknown } } | null)?.properties;
    if (props?.is_current_jahr === true && typeof props.gde_nr === 'number' && Number.isInteger(props.gde_nr)) return props.gde_nr;
  }
  return undefined;
}

/** True for real coordinates. 0/0 is the model default for «not set», and missing or non-finite values are no coordinates. */
export function hasCoordinates(location: { latitude?: number; longitude?: number }): boolean {
  const { latitude, longitude } = location;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return !(latitude === 0 && longitude === 0);
}

/* ------------------------------ ElCom tariffs ------------------------------ */

type SparqlCell = { value?: unknown } | undefined;

function sparqlNumber(binding: Record<string, SparqlCell>, name: string): number {
  const n = Number(binding[name]?.value);
  if (binding[name]?.value === undefined || String(binding[name]?.value).trim() === '' || !Number.isFinite(n)) {
    throw new Error(`ElCom: variable ${name} is not a number`);
  }
  return n;
}

/**
 * ElCom tariff rows (category H4, product standard) out of a SPARQL JSON result with the variables
 * `period`, `operatorName`, `total`, `energy`, `gridusage`, `charge`, `aidfee`. Oldest year first,
 * then by operator name, so the order does not depend on the endpoint. Throws on a non-numeric value:
 * a changed schema must not be written as zeros.
 */
export function tariffsFromSparql(response: unknown): EnergyTariff[] {
  const bindings = (response as { results?: { bindings?: unknown } } | null | undefined)?.results?.bindings;
  if (!Array.isArray(bindings)) return [];
  const tariffs = bindings.map((b: Record<string, SparqlCell>): EnergyTariff => ({
    year: sparqlNumber(b, 'period'),
    operatorName: String(b['operatorName']?.value ?? ''),
    total: sparqlNumber(b, 'total'),
    energy: sparqlNumber(b, 'energy'),
    gridUsage: sparqlNumber(b, 'gridusage'),
    charge: sparqlNumber(b, 'charge'),
    aidFee: sparqlNumber(b, 'aidfee'),
  }));
  return tariffs.sort((a, b) => a.year - b.year || a.operatorName.localeCompare(b.operatorName));
}

/* ------------------------------ planning ------------------------------ */

/** The part of a `city` location the job needs. */
export interface CityLocation {
  okey: string;
  latitude?: number;
  longitude?: number;
  tenants?: string[];
  properties?: BaseProperty[];
}

/** BFS number → the union of the tenants of all city locations with that number, sorted. Locations without a number are left out. */
export function tenantsPerBfs(locations: CityLocation[]): Map<number, string[]> {
  const sets = new Map<number, Set<string>>();
  for (const location of locations) {
    const bfsNr = getBfsNr(location);
    if (bfsNr === undefined) continue;
    const set = sets.get(bfsNr) ?? new Set<string>();
    (location.tenants ?? []).forEach((t) => set.add(t));
    sets.set(bfsNr, set);
  }
  return new Map([...sets].map(([bfsNr, set]) => [bfsNr, [...set].sort()]));
}

/**
 * True when `bfsStatus` names the location's current number, i.e. the job already found no data for it.
 * A status naming another number is stale (the number was corrected), and `none` belongs to a location
 * without a number: neither blocks.
 */
export function isBlockedByStatus(location: CityLocation): boolean {
  const bfsNr = getBfsNr(location);
  if (bfsNr === undefined) return false;
  const status = getLocationProperty(location, LOCATION_PROPERTY_BFS_STATUS);
  return status !== undefined && String(status) === String(bfsNr);
}

/**
 * The BFS numbers that need a download: ascending, each once, from locations that are not blocked by
 * their status. `fetchedAt` maps a number to the ISO timestamp of its document; a number with no entry,
 * an unreadable stamp or a stamp 7 days old or older is wanted. An unreadable stamp must mean «fetch»,
 * never «skip forever».
 */
export function bfsNumbersToFetch(locations: CityLocation[], fetchedAt: Map<number, string>, now: Date): number[] {
  const wanted = new Set<number>();
  for (const location of locations) {
    const bfsNr = getBfsNr(location);
    if (bfsNr === undefined || isBlockedByStatus(location)) continue;
    const stamp = fetchedAt.get(bfsNr);
    const then = stamp === undefined ? Number.NaN : Date.parse(stamp);
    if (Number.isNaN(then) || now.getTime() - then >= REFETCH_AFTER_MS) wanted.add(bfsNr);
  }
  return [...wanted].sort((a, b) => a - b);
}

/**
 * The `bfsStatus` to store on a location after a run, or undefined to clear it (spec §5.3):
 * - `data`: clear;
 * - `noRow`: Energie Reporter has no row for this number, so the status names it;
 * - `noMunicipality`: the coordinates give no Swiss municipality, so `none`.
 * A `noRow` for a location that has no number at all cannot be told apart from «no municipality»: `none`.
 */
export function nextBfsStatus(location: CityLocation, outcome: 'data' | 'noRow' | 'noMunicipality'): string | undefined {
  if (outcome === 'data') return undefined;
  if (outcome === 'noMunicipality') return LOCATION_BFS_STATUS_NONE;
  const bfsNr = getBfsNr(location);
  return bfsNr === undefined ? LOCATION_BFS_STATUS_NONE : String(bfsNr);
}

/* ------------------------------ document patch ------------------------------ */

/** What one source delivered for one municipality; a source that failed or had no data is simply absent. */
export interface EnergyPatchInput {
  bfsNr: number;
  tenants: string[];
  now: Date;
  /** Energie Reporter: present only when the source succeeded and returned at least one month. */
  reporter?: { municipality: string; canton: string; months: EnergyMonth[] };
  /** ElCom: present only when the source succeeded (an empty list is a valid answer). */
  tariffs?: EnergyTariff[];
}

/**
 * The fields to `set(..., { merge: true })` for one municipality (spec §5.3, «Failure»): only the fields of
 * the sources that succeeded, so a failed source keeps its previous values. `fetchedAt` moves only when both
 * succeeded, so the missing source is retried the next night. `months` is oldest first and `sourceDate` is
 * the date of the newest month.
 */
export function buildEnergyPatch(input: EnergyPatchInput): Record<string, unknown> {
  const patch: Record<string, unknown> = { bfsNr: input.bfsNr, tenants: input.tenants, isArchived: false };
  const reporter = input.reporter && input.reporter.months.length > 0 ? input.reporter : undefined;
  if (reporter) {
    const months = [...reporter.months].sort((a, b) => a.date.localeCompare(b.date));
    patch['municipality'] = reporter.municipality;
    patch['canton'] = reporter.canton;
    patch['months'] = months;
    patch['sourceDate'] = months[months.length - 1].date;
  }
  if (input.tariffs) patch['tariffs'] = input.tariffs;
  if (reporter && input.tariffs) patch['fetchedAt'] = input.now.toISOString();
  return patch;
}

/* ------------------------------ streamed CSV ------------------------------ */

/** The rows of one municipality out of the Energie Reporter CSV. */
export interface ReporterRows { municipality: string; canton: string; months: EnergyMonth[] }

/**
 * Reads the Energie Reporter CSV line by line and keeps only the rows of `wanted` BFS numbers: the file
 * unpacks to about 28 MB and the nightly instance is small, so nothing else is held. Columns are read by
 * header name. Throws on a missing header or column (the whole source fails, and nothing is overwritten).
 * A malformed row fails its municipality alone: it lands in `failed` and is left out of `found`.
 * A wanted number that has no row is in neither map.
 */
export async function collectReporterRows(
  lines: AsyncIterable<string>,
  wanted: ReadonlySet<number>,
): Promise<{ found: Map<number, ReporterRows>; failed: Map<number, Error> }> {
  const found = new Map<number, ReporterRows>();
  const failed = new Map<number, Error>();
  const newest = new Map<number, string>();
  let header: string[] | undefined;
  let bfsColumn = -1;
  for await (const raw of lines) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (header === undefined) {
      header = parseHeader(line);
      assertEnergyReporterHeader(header);
      bfsColumn = header.indexOf('bfs_nr');
      continue;
    }
    if (line === '') continue;
    // Cheap filter before the full parse: most of the 200 000 lines belong to other municipalities.
    if (bfsColumn === 0) {
      const comma = line.indexOf(',');
      if (!wanted.has(Number(line.slice(0, comma < 0 ? undefined : comma).replace(/"/g, '')))) continue;
    }
    const cells = parseCsvLine(line);
    const bfsNr = Number(cells[bfsColumn]);
    if (!wanted.has(bfsNr) || failed.has(bfsNr)) continue;
    const row = Object.fromEntries(header.map((name, i) => [name, cells[i] ?? '']));
    try {
      const month = rowToMonth(row);
      const entry = found.get(bfsNr) ?? { municipality: '', canton: '', months: [] };
      entry.months.push(month);
      if (newest.get(bfsNr) === undefined || month.date >= (newest.get(bfsNr) as string)) {
        newest.set(bfsNr, month.date);
        entry.municipality = row['municipality'].trim();
        entry.canton = row['canton'].trim();
      }
      found.set(bfsNr, entry);
    } catch (error) {
      failed.set(bfsNr, error instanceof Error ? error : new Error(String(error)));
      found.delete(bfsNr);
    }
  }
  if (header === undefined) throw new Error('Energie Reporter CSV: file is empty');
  return { found, failed };
}
