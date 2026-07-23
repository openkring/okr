// apps/functions/src/_gateway/quota.spec.ts
import { describe, it, expect } from 'vitest';
import { monthKey } from './quota';

describe('monthKey', () => {
  it('formats YYYY-MM in UTC', () => {
    expect(monthKey(new Date('2026-07-23T10:00:00Z').getTime())).toBe('2026-07');
    expect(monthKey(new Date('2026-01-01T00:00:00Z').getTime())).toBe('2026-01');
    expect(monthKey(new Date('2026-12-31T23:59:59Z').getTime())).toBe('2026-12');
  });
});
