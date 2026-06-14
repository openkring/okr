/**
 * Helpers for editing a chart section's ECharts option as a plain JSON object.
 *
 * The model stores `ChartSection.properties` as ECharts' `EChartsOption`, but these
 * helpers operate on a structural `Record<string, unknown>` so the dumb UI lib does
 * not need a dependency on `echarts`. The renderer registers only Bar and Line charts,
 * so {@link CHART_TYPES} is limited to what can actually be drawn.
 */
export type ChartOption = Record<string, unknown>;

/** Chart types the renderer can draw (echarts.use registers BarChart + LineChart). */
export const CHART_TYPES = ['bar', 'line'];

/** A minimal, renderable starter option for a freshly created chart of the given type. */
export function defaultChartOption(type: string): ChartOption {
  return {
    xAxis: { type: 'category', data: ['A', 'B', 'C'] },
    yAxis: { type: 'value' },
    series: [{ type, data: [120, 200, 150] }]
  };
}

/** Reads the chart type from the first series; defaults to 'bar'. */
export function getChartType(option: ChartOption | undefined): string {
  const series = option?.['series'];
  if (Array.isArray(series) && series.length > 0) {
    const first = series[0] as Record<string, unknown>;
    if (typeof first?.['type'] === 'string') return first['type'] as string;
  } else if (series && typeof series === 'object') {
    const t = (series as Record<string, unknown>)['type'];
    if (typeof t === 'string') return t;
  }
  return 'bar';
}

/**
 * Sets the chart type on every series. If the option is empty (a new chart),
 * scaffolds a minimal renderable option so the chart shows something immediately.
 */
export function setChartType(option: ChartOption | undefined, type: string): ChartOption {
  if (!option || Object.keys(option).length === 0) return defaultChartOption(type);
  const opt: ChartOption = { ...option };
  const series = opt['series'];
  if (Array.isArray(series)) {
    opt['series'] = series.map((s) => ({ ...(s as Record<string, unknown>), type }));
  } else if (series && typeof series === 'object') {
    opt['series'] = { ...(series as Record<string, unknown>), type };
  } else {
    opt['series'] = [{ type, data: [120, 200, 150] }];
  }
  return opt;
}

/** Reads `title.text`; '' when absent. */
export function getChartTitle(option: ChartOption | undefined): string {
  const title = option?.['title'];
  if (title && typeof title === 'object') {
    const text = (title as Record<string, unknown>)['text'];
    if (typeof text === 'string') return text;
  }
  return '';
}

/** Sets `title.text`, preserving any other title properties. */
export function setChartTitle(option: ChartOption | undefined, text: string): ChartOption {
  const opt: ChartOption = option ? { ...option } : {};
  const existing = opt['title'] && typeof opt['title'] === 'object' ? (opt['title'] as Record<string, unknown>) : {};
  opt['title'] = { ...existing, text };
  return opt;
}

/** Safely parses a JSON object; returns undefined for invalid JSON or non-objects. */
export function parseChartOption(text: string): ChartOption | undefined {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ChartOption;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Pretty-prints the option as JSON; '' for an empty/undefined option. */
export function stringifyChartOption(option: ChartOption | undefined): string {
  if (!option || Object.keys(option).length === 0) return '';
  return JSON.stringify(option, null, 2);
}
