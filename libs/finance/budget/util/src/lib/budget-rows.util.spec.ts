import { describe, expect, it } from 'vitest';

import { isNetOver, isOver } from './budget-rows.util';

describe('isOver / isNetOver', () => {
  it('expense: more actual than budget is over', () => {
    expect(isOver('expense', 1)).toBe(true);
    expect(isOver('expense', -1)).toBe(false);
    expect(isOver('expense', 0)).toBe(false);
  });
  it('revenue: less actual than budget is over', () => {
    expect(isOver('revenue', -1)).toBe(true);
    expect(isOver('revenue', 1)).toBe(false);
  });
  it('net: below the budgeted result is over', () => {
    expect(isNetOver(-1)).toBe(true);
    expect(isNetOver(0)).toBe(false);
  });
});
