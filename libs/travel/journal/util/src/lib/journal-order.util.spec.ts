import { describe, expect, it } from 'vitest';
import { orderBetween, reorderedOrders, sortByOrder } from './journal-order.util';

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

  it('orderBetween refuses equal or reversed bounds', () => {
    expect(() => orderBetween('V', 'V')).toThrow(RangeError);
    expect(() => orderBetween('W', 'V')).toThrow(RangeError);
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
  describe('reorderedOrders', () => {
    const blocks = [{ key: 'x', order: 'a0' }, { key: 'y', order: 'a1' }, { key: 'z', order: 'a2' }];

    it('reorder moves one block', () => {
      const changed = reorderedOrders(blocks, ['z', 'x', 'y']);
      expect(Object.keys(changed)).toEqual(['z']);
      expect(changed['z'] < 'a0').toBe(true);
    });

    it('reorder with equal orders', () => {
      const tied = [{ key: 'p', order: 'a1' }, { key: 'q', order: 'a1' }, { key: 'r', order: 'a2' }];
      const changed = reorderedOrders(tied, ['p', 'q', 'r']);
      const seq = ['p', 'q', 'r'].map((k) => changed[k] ?? tied.find((b) => b.key === k)?.order ?? '');
      expect(seq[0] < seq[1] && seq[1] < seq[2]).toBe(true);
    });

    it('reorder unchanged returns {}', () => {
      expect(reorderedOrders(blocks, ['x', 'y', 'z'])).toEqual({});
    });

    it('reorder moves several blocks into one gap', () => {
      const changed = reorderedOrders(blocks, ['y', 'z', 'x']);
      const seq = ['y', 'z', 'x'].map((k) => changed[k] ?? blocks.find((b) => b.key === k)?.order ?? '');
      expect(seq[0] < seq[1] && seq[1] < seq[2]).toBe(true);
    });
  });
});
