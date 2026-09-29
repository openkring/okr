import { describe, expect, it } from 'vitest';
import { DEFAULT_JASS_CONFIG, normalizeConfig } from './jass.config';

describe('normalizeConfig', () => {
  it('returns the defaults for garbage', () => {
    expect(normalizeConfig(null)).toEqual(DEFAULT_JASS_CONFIG);
    expect(normalizeConfig('x')).toEqual(DEFAULT_JASS_CONFIG);
  });
  it('keeps valid fields and repairs invalid ones', () => {
    const c = normalizeConfig({ schieberTarget: 2500, bueterPairTarget: -3, coiffeurRows: 'no' });
    expect(c.schieberTarget).toBe(2500);
    expect(c.bueterPairTarget).toBe(1000);
    expect(c.coiffeurRows).toEqual(DEFAULT_JASS_CONFIG.coiffeurRows);
    expect(c.differenzlerHands).toBe(12);
  });
  it('drops malformed rows and sorts rows by multiplier', () => {
    const c = normalizeConfig({ coiffeurRows: [
      { id: 'b', label: 'B', multiplier: 2 }, { id: 'x', label: '', multiplier: 3 }, { id: 'a', label: 'A', multiplier: 1 },
    ] });
    expect(c.coiffeurRows.map(r => r.id)).toEqual(['a', 'b']);
  });
  it('drops the retired trump switches of an older stored config', () => {
    expect(Object.keys(normalizeConfig({ suitsDouble: true, slalomQuad: true }))).toEqual(Object.keys(DEFAULT_JASS_CONFIG));
  });
  it('defaults: Schieber 1000, 10 Coiffeur rows 1..10, 12 Differenzler hands', () => {
    expect(DEFAULT_JASS_CONFIG.schieberTarget).toBe(1000);
    expect(DEFAULT_JASS_CONFIG.coiffeurRows.map(r => r.multiplier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
