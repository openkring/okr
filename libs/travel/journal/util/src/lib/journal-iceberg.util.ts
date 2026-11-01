import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

/**
 * Current Antarctic iceberg positions as an overlay on the journal map (spec 2.122). The source is BYU's
 * «Current Icebergs» page, one HTML table without CSV or API; `getIcebergs` (Cloud Function) fetches and parses it
 * through the gateway (shared cache, 30 days) and the device keeps the last answer for offline use.
 */
export const BYU_ICEBERGS_URL = 'https://www.scp.byu.edu/current_icebergs.html';
/** Shown on the map while the layer is on, also for a snapshot read from the device offline. */
export const BYU_ICEBERGS_ATTRIBUTION = { provider: 'BYU Center for Remote Sensing', url: BYU_ICEBERGS_URL };

/** One iceberg: NIC name in upper case (e.g. `A76C`), decimal degrees, the day of its last observation (StoreDate). */
export interface Iceberg { name: string; lat: number; lng: number; seenAt: string }

/** The parsed table: when BYU last revised it (StoreDate, '' if missing) and the icebergs. */
export interface IcebergSnapshot { revisedAt: string; icebergs: Iceberg[] }

/** Response of `getIcebergs`: the snapshot, its attribution and whether it came from a stale cache. */
export interface IcebergsRes extends IcebergSnapshot {
  attribution: { provider: string; url: string };
  stale: boolean;
}

/** `23 56'W` → -23.933…; null when the cell is not degrees, minutes and a hemisphere. */
export function parseDegreesMinutes(cell: string): number | null {
  const m = /^\s*(\d{1,3})\s+(\d{1,2}(?:\.\d+)?)'\s*([NSEW])\s*$/i.exec(cell);
  if (!m) return null;
  const deg = Number(m[1]);
  const min = Number(m[2]);
  if (min >= 60) return null;
  const value = deg + min / 60;
  const hemi = m[3].toUpperCase();
  const max = hemi === 'N' || hemi === 'S' ? 90 : 180;
  if (value > max) return null;
  return Math.round((hemi === 'S' || hemi === 'W' ? -value : value) * 1e4) / 1e4;
}

/** «Last revised: 11:32:50 10/23/26» (US month/day/year) → StoreDate; '' when the page has no such line. */
export function parseRevisedAt(html: string): string {
  const m = /Last revised:[^<]*?(\d{1,2})\/(\d{1,2})\/(\d{2})/i.exec(html);
  if (!m) return '';
  const iso = `20${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return convertDateFormatToString(iso, DateFormat.IsoDate, DateFormat.StoreDate, false);
}

/**
 * The day of year of an observation as StoreDate. The table has no year: it is the year of the revision, or the year
 * before when the day lies after the revision day (a January list still holding December observations).
 */
export function seenAtOf(dayOfYear: number, revisedAt: string): string {
  const revised = revisedAt ? new Date(Date.UTC(Number(revisedAt.slice(0, 4)), Number(revisedAt.slice(4, 6)) - 1, Number(revisedAt.slice(6, 8)))) : new Date();
  const year = revised.getUTCFullYear();
  const revisedDay = Math.round((revised.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  const y = dayOfYear > revisedDay ? year - 1 : year;
  const iso = new Date(Date.UTC(y, 0, dayOfYear)).toISOString().slice(0, 10);
  return convertDateFormatToString(iso, DateFormat.IsoDate, DateFormat.StoreDate, false);
}

const stripTags = (cell: string): string => cell.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

/**
 * The BYU table as a snapshot. Rows are `<tr><td>a76c</td><td>23 56'W</td><td> 56 45'S</td><td> 293</td></tr>`; the
 * header row and any row that does not parse are skipped, so a changed layout yields fewer icebergs instead of
 * wrong ones.
 */
export function parseByuIcebergs(html: string): IcebergSnapshot {
  const revisedAt = parseRevisedAt(html);
  const icebergs: Iceberg[] = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]));
    if (cells.length < 4) continue;
    const [name, lngCell, latCell, dayCell] = cells;
    if (!/^[a-z]{1,3}\d{1,3}[a-z]?$/i.test(name)) continue;
    const lng = parseDegreesMinutes(lngCell);
    const lat = parseDegreesMinutes(latCell);
    const day = Number(dayCell);
    if (lng === null || lat === null || !/[EW]\s*$/i.test(lngCell) || !/[NS]\s*$/i.test(latCell)) continue;
    if (!Number.isInteger(day) || day < 1 || day > 366) continue;
    icebergs.push({ name: name.toUpperCase(), lat, lng, seenAt: seenAtOf(day, revisedAt) });
  }
  return { revisedAt, icebergs };
}

/** A snapshot read back from device storage, or undefined when it is missing or damaged. */
export function parseStoredIcebergs(raw: string | null | undefined): IcebergSnapshot | undefined {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<IcebergSnapshot>) : undefined;
    if (!value || !Array.isArray(value.icebergs)) return undefined;
    const icebergs = value.icebergs.filter((i): i is Iceberg =>
      typeof i?.name === 'string' && typeof i.lat === 'number' && typeof i.lng === 'number' && typeof i.seenAt === 'string');
    return { revisedAt: typeof value.revisedAt === 'string' ? value.revisedAt : '', icebergs };
  } catch {
    return undefined;
  }
}
