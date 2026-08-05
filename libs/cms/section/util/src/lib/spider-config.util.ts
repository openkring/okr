import { SPIDER_CONFIG_SHAPE, SpiderAxis, SpiderConfig, SpiderSeries } from '@okr/shared-models';

/**
 * Helpers for the spider (radar) section: default coalescing, axis/series validation and the
 * mapping to an ECharts option. `series[i].values` is index-parallel to `axes`; shorter series are
 * padded with 0, longer ones are cut, and every value is clamped to its axis maximum — an invalid
 * config degrades instead of breaking the chart.
 *
 * The option is returned as a plain `Record<string, unknown>` so neither this lib nor the dumb UI
 * lib needs a dependency on `echarts`; the renderer casts it to `EChartsOption`.
 */
export type SpiderOption = Record<string, unknown>;

/** A radar with fewer than 3 axes is not a net. */
export const MIN_SPIDER_AXES = 3;

/** Firestore reads return raw documents — older sections lack the newer fields. */
export function withSpiderDefaults(config: SpiderConfig | undefined): SpiderConfig {
  return {
    axes: config?.axes ?? SPIDER_CONFIG_SHAPE.axes,
    series: config?.series ?? SPIDER_CONFIG_SHAPE.series,
    shape: config?.shape ?? SPIDER_CONFIG_SHAPE.shape,
    areaOpacity: config?.areaOpacity ?? SPIDER_CONFIG_SHAPE.areaOpacity,
    showLegend: config?.showLegend ?? SPIDER_CONFIG_SHAPE.showLegend,
  };
}

/** Keeps only axes ECharts can draw: a non-empty name and a positive maximum. */
export function validAxes(axes: SpiderAxis[] | undefined): SpiderAxis[] {
  return (axes ?? []).filter((a) =>
    typeof a?.name === 'string' && a.name.trim().length > 0 &&
    typeof a.maxValue === 'number' && Number.isFinite(a.maxValue) && a.maxValue > 0
  );
}

/** Aligns every series to the axes: padded to length, non-numbers to 0, clamped to [0, maxValue]. */
export function alignedSeries(series: SpiderSeries[] | undefined, axes: SpiderAxis[]): SpiderSeries[] {
  return (series ?? [])
    .filter((s) => typeof s?.name === 'string' && s.name.trim().length > 0)
    .map((s) => ({
      name: s.name,
      values: axes.map((axis, i) => {
        const value = s.values?.[i];
        if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
        return Math.min(Math.max(value, 0), axis.maxValue);
      }),
    }));
}

/** Maps the section config to an ECharts radar option; undefined when there is nothing to draw. */
export function toSpiderOption(config: SpiderConfig | undefined): SpiderOption | undefined {
  const cfg = withSpiderDefaults(config);
  const axes = validAxes(cfg.axes);
  const series = alignedSeries(cfg.series, axes);
  if (axes.length < MIN_SPIDER_AXES || series.length === 0) return undefined;
  return {
    tooltip: { trigger: 'item' },
    ...(cfg.showLegend ? { legend: { data: series.map((s) => s.name), bottom: 0 } } : {}),
    radar: {
      shape: cfg.shape,
      indicator: axes.map((a) => ({ name: a.name, max: a.maxValue })),
    },
    series: [{
      type: 'radar',
      data: series.map((s) => ({ name: s.name, value: s.values })),
      areaStyle: { opacity: cfg.areaOpacity },
      emphasis: { focus: 'series' },
    }],
  };
}

/** Parses an axis or series list from the editor JSON; undefined for invalid JSON or a non-array. */
export function parseSpiderList<T>(text: string): T[] | undefined {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as T[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Pretty-prints a list as JSON; '' for an empty list. */
export function stringifySpiderList(list: unknown[] | undefined): string {
  if (!list || list.length === 0) return '';
  return JSON.stringify(list, null, 2);
}
