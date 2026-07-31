import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { MoneyModel } from '@okr/shared-models';

import { convertDateFormatToString, DateFormat } from './date.util';

/**
 * One column of a CSV export: a already-translated header plus the accessor that
 * renders a single item into that column's cell.
 *
 * Kept generic (and pure) so each feature's `util` lib can declare its column set
 * declaratively and unit-test it, while the feature store only wires the translated
 * labels and the category-label resolvers in.
 */
export interface ExportColumn<T> {
  header: string;
  value: (item: T) => string;
}

/**
 * Build the 2D string table that `exportCsv` expects: the header row followed by one
 * row per item.
 * @param items the (already filtered and sorted) items to export
 * @param columns the column definitions
 */
export function buildExportTable<T>(items: readonly T[], columns: readonly ExportColumn<T>[]): string[][] {
  return [columns.map((column) => column.header), ...items.map((item) => columns.map((column) => column.value(item)))];
}

/**
 * Render a StoreDate (yyyymmdd) as a ViewDate (dd.MM.yyyy) for an export.
 * An empty/invalid date and the open-end marker (99991231) both render as an empty cell —
 * '31.12.9999' would only be noise in a spreadsheet.
 */
export function formatExportDate(storeDate?: string): string {
  // Guard the shape ourselves: convertDateFormat's non-strict mode only tolerates an empty
  // value — a garbled date still reaches date-fns' format() and throws a RangeError. An
  // export must never abort over one bad legacy row.
  if (!storeDate || storeDate === END_FUTURE_DATE_STR || !/^\d{8}$/.test(storeDate)) return '';
  return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
}

/**
 * Render a StoreDateTime (yyyymmddHHmmss) or a StoreTime (HHmm) as a plain time (HH:mm).
 * Anything else (empty, unparseable) renders as an empty cell.
 */
export function formatExportTime(storeTime?: string): string {
  if (!storeTime) return '';
  if (/^\d{4}$/.test(storeTime)) return `${storeTime.substring(0, 2)}:${storeTime.substring(2)}`;
  if (/^\d{2}:\d{2}$/.test(storeTime)) return storeTime;
  return '';
}

/**
 * The amount of a price as a plain number string, for a numeric spreadsheet column.
 *
 * Tolerates the legacy shape found on older documents (`price: 50` next to a sibling
 * `currency: 'CHF'` field) as well as the current {@link MoneyModel}. The amount is
 * exported unscaled — exactly the number the edit forms show and store.
 */
export function getPriceAmount(price?: MoneyModel | number): string {
  if (price === undefined || price === null) return '';
  if (typeof price === 'number') return String(price);
  return price.amount === undefined || price.amount === null ? '' : String(price.amount);
}

/**
 * The currency of a price. Falls back to the given currency (e.g. a legacy sibling
 * `currency` field) when the price carries none.
 */
export function getPriceCurrency(price?: MoneyModel | number, fallbackCurrency = ''): string {
  if (price === undefined || price === null) return fallbackCurrency;
  if (typeof price === 'number') return fallbackCurrency;
  return price.currency ?? fallbackCurrency;
}

/**
 * Render a value that may be a string list or a comma-separated string (tags are stored
 * both ways across the model zoo) as a single comma-separated cell.
 */
export function formatExportList(value?: string | string[]): string {
  if (!value) return '';
  return Array.isArray(value) ? value.join(', ') : value;
}

/**
 * Render a boolean as a locale-independent yes/no cell.
 * @param value the flag
 * @param yes the label for `true`
 * @param no the label for `false`
 */
export function formatExportBoolean(value: boolean | undefined, yes: string, no: string): string {
  return value === true ? yes : no;
}
