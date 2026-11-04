// Type-only: a value import would pull echarts into every bundle that touches this util.
import type { EChartsOption } from 'echarts';

import { EnergyTariff } from '@okr/shared-models';

import type { TariffLabels } from './energy-figures.util';

/** StoreDate yyyymmdd -> mm.yyyy. The snapshots are month ends, so the day adds nothing. */
function monthLabel(storeDate: string): string {
  return /^\d{8}$/.test(storeDate) ? `${storeDate.substring(4, 6)}.${storeDate.substring(0, 4)}` : storeDate;
}

/** How light a not yet valid tariff year is drawn. */
const FUTURE_OPACITY = 0.45;

/**
 * Line chart over StoreDate points. A `null` value stays in the data and `connectNulls` is off,
 * so a missing month is a gap in the line, not an interpolated value.
 */
export function trendChartOption(series: { name: string; points: [string, number | null][] }[], unit: string): EChartsOption {
  const dates = [...new Set(series.flatMap((s) => s.points.map(([date]) => date)))].sort();
  return {
    tooltip: { trigger: 'axis' },
    legend: series.length > 1 ? { top: 0 } : undefined,
    grid: { left: 8, right: 16, top: series.length > 1 ? 32 : 16, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: dates, axisLabel: { formatter: (value: string) => monthLabel(value) } },
    yAxis: { type: 'value', name: unit },
    series: series.map((s) => ({
      name: s.name,
      type: 'line' as const,
      connectNulls: false,
      showSymbol: false,
      data: s.points
    }))
  };
}

/**
 * Stacked bars of the four tariff components, one bar per year, for ONE operator's rows (several
 * operators get one chart each). A year after `calendarYear` is not yet what anyone pays: its bars
 * are lighter and its label carries `labels.future`.
 */
export function tariffChartOption(tariffs: EnergyTariff[], labels: TariffLabels, calendarYear: number): EChartsOption {
  const years = [...new Set(tariffs.map((t) => t.year))].sort((a, b) => a - b);
  const components: { field: 'energy' | 'gridUsage' | 'charge' | 'aidFee'; name: string }[] = [
    { field: 'energy', name: labels.energy },
    { field: 'gridUsage', name: labels.gridUsage },
    { field: 'charge', name: labels.charge },
    { field: 'aidFee', name: labels.aidFee }
  ];
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0 },
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: years.map((year) => (year > calendarYear ? `${year} (${labels.future})` : String(year)))
    },
    yAxis: { type: 'value', name: labels.unit },
    series: components.map((component) => ({
      name: component.name,
      type: 'bar' as const,
      stack: 'tariff',
      data: years.map((year) => {
        const value = tariffs.find((t) => t.year === year)?.[component.field] ?? null;
        return year > calendarYear ? { value, itemStyle: { opacity: FUTURE_OPACITY } } : { value };
      })
    }))
  };
}
