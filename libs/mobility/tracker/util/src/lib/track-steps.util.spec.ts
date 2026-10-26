import { describe, expect, it } from 'vitest';
import type { LocalSection } from './track-sections.util';
import { STEPS_HISTORY_MS, withQueriedSteps } from './track-steps.util';

const DAY = 24 * 3_600_000;
const NOW = Date.UTC(2026, 9, 26, 12);
const section = (mode: LocalSection['mode'], endMs: number, steps?: number): LocalSection => {
  const s: LocalSection = { mode, detected: false, points: [{ lat: 47, lng: 8, t: endMs - 600_000 }, { lat: 47.001, lng: 8, t: endMs }] };
  if (steps !== undefined) s.steps = steps;
  return s;
};

describe('withQueriedSteps', () => {
  it('re-queries a foot section within the step history', async () => {
    const calls: [number, number][] = [];
    const r = await withQueriedSteps([section('foot', NOW - DAY, 10)], async (from, to) => { calls.push([from, to]); return 999; }, NOW);
    expect(r[0].steps).toBe(999);
    expect(calls).toEqual([[NOW - DAY - 600_000, NOW - DAY]]);
  });
  it('keeps the stored value of a section older than the history', async () => {
    const r = await withQueriedSteps([section('foot', NOW - 8 * DAY, 10)], async () => 999, NOW);
    expect(r[0].steps).toBe(10);
    expect(STEPS_HISTORY_MS).toBe(7 * DAY);
  });
  it('drops steps from a non-foot section', async () => {
    const r = await withQueriedSteps([section('car', NOW - DAY, 10)], async () => 999, NOW);
    expect('steps' in r[0]).toBe(false);
  });
  it('keeps the stored value when the query rejects or answers nothing', async () => {
    const rejected = await withQueriedSteps([section('foot', NOW - DAY, 10)], () => Promise.reject(new Error('web')), NOW);
    expect(rejected[0].steps).toBe(10);
    const empty = await withQueriedSteps([section('foot', NOW - DAY, 10)], async () => undefined, NOW);
    expect(empty[0].steps).toBe(10);
  });
  it('leaves a section without points untouched', async () => {
    const s: LocalSection = { mode: 'foot', detected: false, points: [], steps: 5 };
    const r = await withQueriedSteps([s], async () => 999, NOW);
    expect(r[0]).toEqual(s);
  });
});
