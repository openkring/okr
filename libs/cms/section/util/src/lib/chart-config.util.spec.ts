import { describe, expect, it } from 'vitest';

import { defaultChartOption, getChartTitle, getChartType, parseChartOption, setChartTitle, setChartType, stringifyChartOption } from './chart-config.util';

describe('defaultChartOption', () => {
  it('produces a renderable option with the given series type', () => {
    const opt = defaultChartOption('line');
    expect((opt['series'] as any[])[0].type).toBe('line');
    expect(opt['xAxis']).toBeDefined();
    expect(opt['yAxis']).toBeDefined();
  });
});

describe('getChartType', () => {
  it('returns bar for an empty/undefined option', () => {
    expect(getChartType(undefined)).toBe('bar');
    expect(getChartType({})).toBe('bar');
  });
  it('reads the type from an array of series', () => {
    expect(getChartType({ series: [{ type: 'line', data: [] }] })).toBe('line');
  });
  it('reads the type from a single series object', () => {
    expect(getChartType({ series: { type: 'bar', data: [] } })).toBe('bar');
  });
});

describe('setChartType', () => {
  it('scaffolds a default option when empty', () => {
    const opt = setChartType({}, 'line');
    expect((opt['series'] as any[])[0].type).toBe('line');
    expect(opt['xAxis']).toBeDefined();
  });
  it('updates the type of every series, preserving data', () => {
    const opt = setChartType({ series: [{ type: 'bar', data: [1, 2] }, { type: 'bar', data: [3] }] }, 'line');
    const series = opt['series'] as any[];
    expect(series.every((s) => s.type === 'line')).toBe(true);
    expect(series[0].data).toEqual([1, 2]);
  });
  it('preserves other top-level option keys', () => {
    const opt = setChartType({ title: { text: 'X' }, series: [{ type: 'bar' }] }, 'line');
    expect((opt['title'] as any).text).toBe('X');
  });
});

describe('getChartTitle / setChartTitle', () => {
  it('returns empty string when no title', () => {
    expect(getChartTitle({})).toBe('');
  });
  it('round-trips the title text', () => {
    const opt = setChartTitle({}, 'My chart');
    expect(getChartTitle(opt)).toBe('My chart');
  });
  it('preserves other title properties', () => {
    const opt = setChartTitle({ title: { left: 'center' } }, 'T');
    expect((opt['title'] as any).left).toBe('center');
    expect((opt['title'] as any).text).toBe('T');
  });
});

describe('parseChartOption', () => {
  it('parses a valid JSON object', () => {
    expect(parseChartOption('{"a":1}')).toEqual({ a: 1 });
  });
  it('returns undefined for invalid JSON', () => {
    expect(parseChartOption('{not json')).toBeUndefined();
  });
  it('returns undefined for a JSON array or primitive', () => {
    expect(parseChartOption('[1,2]')).toBeUndefined();
    expect(parseChartOption('42')).toBeUndefined();
  });
});

describe('stringifyChartOption', () => {
  it('returns empty string for empty/undefined option', () => {
    expect(stringifyChartOption(undefined)).toBe('');
    expect(stringifyChartOption({})).toBe('');
  });
  it('pretty-prints a populated option', () => {
    expect(stringifyChartOption({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
