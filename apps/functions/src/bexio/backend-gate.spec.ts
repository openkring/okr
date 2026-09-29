import { describe, expect, it } from 'vitest';
import { isBexioBackend } from './backend-gate';

describe('isBexioBackend', () => {
  it('is true only for bexio', () => {
    expect(isBexioBackend({ accountingBackend: 'bexio' })).toBe(true);
    expect(isBexioBackend({ accountingBackend: 'native' })).toBe(false);
    expect(isBexioBackend({ accountingBackend: 'datev' })).toBe(false);
  });
  it('treats a missing config or field as native', () => {
    expect(isBexioBackend(undefined)).toBe(false);
    expect(isBexioBackend({})).toBe(false);
  });
});
