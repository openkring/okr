import { describe, expect, it } from 'vitest';
import { orderBetween, sortByOrder } from './journal-order.util';

describe('journal order', () => {
  it('orderBetween stays strictly ordered', () => {
    const first = orderBetween();
    expect(first.length).toBeGreaterThan(0);

    const last = orderBetween(first, undefined);
    expect(last > first).toBe(true);

    // 50 inserts, always directly after `first` — each new value lies between first and the previous one
    let upper = last;
    for (let i = 0; i < 50; i++) {
      const mid = orderBetween(first, upper);
      expect(mid > first).toBe(true);
      expect(mid < upper).toBe(true);
      upper = mid;
    }

    // 50 appends
    let prev = last;
    for (let i = 0; i < 50; i++) {
      const next = orderBetween(prev, undefined);
      expect(next > prev).toBe(true);
      prev = next;
    }

    // 50 prepends
    let low = first;
    for (let i = 0; i < 50; i++) {
      const before = orderBetween(undefined, low);
      expect(before < low).toBe(true);
      expect(before.length).toBeGreaterThan(0);
      low = before;
    }
  });

  it('sortByOrder sorts by order, then by okey, and puts missing order last', () => {
    const items = [
      { okey: 'c', order: 'b' },
      { okey: 'b' },
      { okey: 'a', order: 'b' },
      { okey: 'd', order: 'a' },
    ];
    expect(sortByOrder(items).map((i) => i.okey)).toEqual(['d', 'a', 'c', 'b']);
  });
});
