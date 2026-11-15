import { describe, expect, it } from 'vitest';

import { mapWithConcurrency } from './concurrency.util';

const tick = () => new Promise((r) => setTimeout(r, 1));

describe('mapWithConcurrency', () => {
  it('runs at most limit at once', async () => {
    let inFlight = 0;
    let max = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await tick();
      inFlight--;
    });
    expect(max).toBe(4);
  });

  it('keeps input order', async () => {
    const out = await mapWithConcurrency([30, 1, 10], 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(['0:30', '1:1', '2:10']);
  });

  it('resolves [] for empty input', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });

  it('rejects when one call rejects', async () => {
    await expect(mapWithConcurrency([1, 2], 2, async (n) => { if (n === 2) throw new Error('x'); return n; })).rejects.toThrow('x');
  });
});
