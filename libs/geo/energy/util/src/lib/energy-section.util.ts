// Type-only: a value import would pull echarts into every bundle that touches this util.
import type { EChartsOption } from 'echarts';

import { EnergyFiguresModel, EnergyMonth, EnergyTariff } from '@okr/shared-models';
import { DateFormat, convertDateFormatToString, fill, getBfsNr } from '@okr/shared-util-core';

import { tariffChartOption, trendChartOption } from './energy-chart.util';
import {
  EnergyCompareRow, LocationLike, TariffLabels, compareRow, currentTariff, distinctPeriods, formatCount,
  formatDecimal, formatShare, formatTariffRange, isStale, latestValue, operatorNames
} from './energy-figures.util';
import { EnergyI18n } from './energy-i18n';

const SEPARATOR = ' · ';

/** One key figure: what it is, its value with unit (already formatted), and a line of context (may be empty). */
export interface EnergyTile { label: string; value: string; note: string; }

/** One chart of the section. No `options` means there is nothing to draw, and the section says so. */
export interface EnergyChartBlock { title: string; options: EChartsOption | undefined; }

type TrendSeries = { name: string; points: [string, number | null][] };

function viewDate(storeDate: string): string {
  return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
}

/** «Juli 2026»: a period runs from month start to month end, so the day adds nothing. Built from local parts: the month must not shift. */
function monthAndYear(storeDate: string, lang: string): string {
  const date = new Date(Number(storeDate.slice(0, 4)), Number(storeDate.slice(4, 6)) - 1, Number(storeDate.slice(6, 8)));
  return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(date);
}

/**
 * Energie Reporter stores shares as fractions (0.078), a chart plots percent. A gap stays a gap,
 * and the rounding keeps `0.078 * 100 = 7.800000000000001` out of the tooltip.
 */
export function percentPoints(fraction: number | null | undefined): number | null {
  return typeof fraction === 'number' ? Math.round(fraction * 10000) / 100 : null;
}

const STORE_DATE = /^\d{8}$/;

/** «August 2025 bis Juli 2026». A row without a complete, well-formed period falls back to its own date: a malformed date must not throw inside the tiles. */
function periodNote(from: string | null | undefined, until: string | null | undefined, date: string, i18n: EnergyI18n, lang: string): string {
  return from && until && STORE_DATE.test(from) && STORE_DATE.test(until)
    ? fill(i18n.tiles_periodRange(), { from: monthAndYear(from, lang), until: monthAndYear(until, lang) })
    : fill(i18n.tiles_asOf(), { date: viewDate(date) });
}

/** The household share of the SAME row as the consumption it qualifies; empty when unknown. */
function householdNote(row: EnergyMonth | undefined, i18n: EnergyI18n): string {
  const households = row?.elecConsumptionHouseholdsMwh;
  const total = row?.elecConsumptionMwh;
  if (typeof households !== 'number' || typeof total !== 'number' || total <= 0) return '';
  return fill(i18n.tiles_households(), { share: formatDecimal((households / total) * 100) ?? '' });
}

function withUnit(text: string | undefined, unit: string): string | undefined {
  return text === undefined ? undefined : `${text} ${unit}`;
}

/**
 * The key figures, each with the latest non-null value and the date of THAT value. Consumption and
 * production are 12-month totals that lag the snapshot, so they show their period. A figure
 * without a value is left out, never shown as 0.
 */
export function energyTiles(figures: EnergyFiguresModel, i18n: EnergyI18n, calendarYear: number, lang: string): EnergyTile[] {
  const months = figures.months ?? [];
  const rowOf = (date: string | undefined) => months.find((month) => month.date === date);

  const consumption = latestValue(months, 'elecConsumptionMwh');
  const consumptionRow = rowOf(consumption?.date);
  const production = latestValue(months, 'renewableProductionMwh');
  const productionRow = rowOf(production?.date);

  const dated = (label: string, field: keyof EnergyMonth, format: (value: number) => string | undefined): EnergyTile | undefined => {
    const latest = latestValue(months, field);
    const value = latest ? format(latest.value) : undefined;
    return latest && value !== undefined ? { label, value, note: fill(i18n.tiles_asOf(), { date: viewDate(latest.date) }) } : undefined;
  };
  const period = (label: string, latest: { value: number; date: string } | undefined, note: () => string): EnergyTile | undefined => {
    const value = withUnit(formatCount(latest?.value), i18n.tiles_unitMwh());
    return value === undefined ? undefined : { label, value, note: note() };
  };

  const tariff = currentTariff(figures.tariffs ?? [], calendarYear);
  const tariffValue = withUnit(formatTariffRange(tariff), i18n.tiles_unitRpKwh());

  const tiles: (EnergyTile | undefined)[] = [
    period(i18n.tiles_consumption(), consumption, () =>
      [periodNote(consumptionRow?.elecPeriodFrom, consumptionRow?.elecPeriodUntil, consumption?.date ?? '', i18n, lang), householdNote(consumptionRow, i18n)]
        .filter(Boolean).join(SEPARATOR)),
    period(i18n.tiles_production(), production, () =>
      periodNote(productionRow?.productionPeriodFrom, productionRow?.productionPeriodUntil, production?.date ?? '', i18n, lang)),
    dated(i18n.tiles_solarCapacity(), 'solarKwp', (value) => withUnit(formatCount(value), i18n.tiles_unitKwp())),
    dated(i18n.tiles_solarPotential(), 'solarPotentialUsage', formatShare),
    dated(i18n.tiles_renewableHeating(), 'renewableHeatingShare', formatShare),
    dated(i18n.tiles_electricCars(), 'electricCarCount', formatCount),
    dated(i18n.tiles_chargingPoints(), 'chargingSpotCount', formatCount),
    tariff && tariffValue !== undefined
      ? { label: i18n.tiles_tariff(), value: tariffValue, note: fill(tariff.isFallback ? i18n.tiles_tariffFallback() : i18n.tiles_tariffYear(), { year: tariff.year }) }
      : undefined
  ];
  return tiles.filter((tile) => tile !== undefined);
}

function trendBlock(title: string, series: TrendSeries[], unit: string): EnergyChartBlock {
  const withValues = series.filter((s) => s.points.some(([, value]) => value !== null && value !== undefined));
  return { title, options: withValues.length > 0 ? trendChartOption(withValues, unit) : undefined };
}

/**
 * The trend charts of the main municipality, in the order of the spec. Consumption and production
 * plot one point per distinct period, at its end date; everything else plots every month.
 */
export function energyTrendCharts(months: EnergyMonth[] | undefined, i18n: EnergyI18n): EnergyChartBlock[] {
  const rows = months ?? [];
  const monthly = (field: 'solarKwp' | 'electricCarCount'): [string, number | null][] => rows.map((month) => [month.date, month[field] ?? null]);
  const consumption = distinctPeriods(rows, 'elecPeriodUntil').map((month): [string, number | null] => [month.elecPeriodUntil ?? '', month.elecConsumptionMwh ?? null]);
  const production = distinctPeriods(rows, 'productionPeriodUntil').map((month): [string, number | null] => [month.productionPeriodUntil ?? '', month.renewableProductionMwh ?? null]);

  return [
    trendBlock(i18n.trends_solarCapacity(), [{ name: i18n.tiles_solarCapacity(), points: monthly('solarKwp') }], i18n.tiles_unitKwp()),
    trendBlock(i18n.trends_electricCars(), [{ name: i18n.tiles_electricCars(), points: monthly('electricCarCount') }], ''),
    trendBlock(i18n.trends_renewableHeating(), [{
      name: i18n.tiles_renewableHeating(),
      points: rows.map((month) => [month.date, percentPoints(month.renewableHeatingShare)])
    }], '%'),
    trendBlock(i18n.trends_electricity(), [
      { name: i18n.trends_consumption(), points: consumption },
      { name: i18n.trends_production(), points: production }
    ], i18n.tiles_unitMwh())
  ];
}

/** One tariff chart per network operator of the newest year, each with only its own rows. */
export function energyTariffCharts(tariffs: EnergyTariff[] | undefined, i18n: EnergyI18n, calendarYear: number): EnergyChartBlock[] {
  const rows = tariffs ?? [];
  const labels: TariffLabels = {
    energy: i18n.tariffs_energy(), gridUsage: i18n.tariffs_gridUsage(), charge: i18n.tariffs_charge(),
    aidFee: i18n.tariffs_aidFee(), future: i18n.tariffs_future(), unit: i18n.tariffs_unit()
  };
  return operatorNames(rows).map((name) => ({
    title: fill(i18n.tariffs_operator(), { name }),
    options: tariffChartOption(rows.filter((t) => t.operatorName === name), labels, calendarYear)
  }));
}

/** Whether a tariff year after the calendar year is published, which the charts draw lighter. */
export function hasFutureTariff(tariffs: EnergyTariff[] | undefined, calendarYear: number): boolean {
  return (tariffs ?? []).some((t) => t.year > calendarYear);
}

/** The header lines. `locationName` stands in while a partial document has no municipality name. */
export function energyHeader(figures: EnergyFiguresModel, locationName: string, i18n: EnergyI18n): { name: string; facts: string; operators: string } {
  const operators = operatorNames(figures.tariffs ?? []);
  return {
    name: figures.municipality || locationName,
    facts: [
      fill(i18n.header_bfsNr(), { n: figures.bfsNr }),
      figures.sourceDate ? fill(i18n.header_asOf(), { date: viewDate(figures.sourceDate) }) : ''
    ].filter(Boolean).join(SEPARATOR),
    operators: operators.length > 0 ? `${i18n.header_operators()}: ${operators.join(', ')}` : ''
  };
}

/** The line that shows the age of old figures; empty while they are current. */
export function energyStaleNote(sourceDate: string | undefined, now: Date, i18n: EnergyI18n): string {
  return sourceDate && isStale(sourceDate, now) ? fill(i18n.state_stale(), { date: viewDate(sourceDate) }) : '';
}

/**
 * What a comparison location contributes. `LocationService.read` already filters archived documents;
 * the check here keeps that rule true for any other source. Without a name the location is unknown.
 */
export function compareTarget(location: (LocationLike & { name: string; isArchived?: boolean }) | undefined): { name: string | undefined; bfsNr: number | undefined } {
  if (!location || location.isArchived) return { name: undefined, bfsNr: undefined };
  return { name: location.name, bfsNr: getBfsNr(location) };
}

/** A comparison location after its lookup: no figures means its row says so. */
export interface EnergyCompared { name: string | undefined; figures: EnergyFiguresModel | undefined; }

/**
 * The comparison table, main municipality first. Every comparison location keeps its row, so one
 * without data cannot hide the others. A location that no longer exists has no name to show, so
 * its row carries `unknownName`. Without comparison locations there is nothing to compare.
 */
export function energyCompareRows(mainName: string, main: EnergyFiguresModel, compared: EnergyCompared[], unknownName: string, calendarYear: number): EnergyCompareRow[] {
  if (compared.length === 0) return [];
  return [
    compareRow(mainName, main, calendarYear),
    ...compared.map((entry) => compareRow(entry.name ?? unknownName, entry.figures, calendarYear))
  ];
}
