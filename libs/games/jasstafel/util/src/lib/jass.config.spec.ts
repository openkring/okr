import { describe, expect, it } from 'vitest';
import { DEFAULT_JASS_CONFIG, normalizeConfig, trumpMultiplier } from './jass.config';

describe('trumpMultiplier', () => {
  it('counts every trump 1× by default', () => {
    for (const t of ['eicheln', 'schellen', 'schilten', 'rosen', 'obenabe', 'undenufe', 'slalom']) {
      expect(trumpMultiplier(t, DEFAULT_JASS_CONFIG)).toBe(1);
    }
  });
  it('applies the three switches independently', () => {
    const c = { ...DEFAULT_JASS_CONFIG, suitsDouble: true, topDownTriple: true, slalomQuad: true };
    expect(trumpMultiplier('schilten', c)).toBe(2);
    expect(trumpMultiplier('schellen', c)).toBe(2);
    expect(trumpMultiplier('eicheln', c)).toBe(1);
    expect(trumpMultiplier('rosen', c)).toBe(1);
    expect(trumpMultiplier('obenabe', c)).toBe(3);
    expect(trumpMultiplier('undenufe', c)).toBe(3);
    expect(trumpMultiplier('slalom', c)).toBe(4);
    expect(trumpMultiplier('slalom', { ...DEFAULT_JASS_CONFIG, topDownTriple: true })).toBe(1);
  });
});

describe('normalizeConfig', () => {
  it('returns the defaults for garbage', () => {
    expect(normalizeConfig(null)).toEqual(DEFAULT_JASS_CONFIG);
    expect(normalizeConfig('x')).toEqual(DEFAULT_JASS_CONFIG);
  });
  it('keeps valid fields and repairs invalid ones', () => {
    const c = normalizeConfig({ schieberTarget: 2500, bueterPairTarget: -3, slalomQuad: true, coiffeurRows: 'no' });
    expect(c.schieberTarget).toBe(2500);
    expect(c.bueterPairTarget).toBe(1000);
    expect(c.slalomQuad).toBe(true);
    expect(c.coiffeurRows).toEqual(DEFAULT_JASS_CONFIG.coiffeurRows);
    expect(c.differenzlerHands).toBe(12);
  });
  it('drops malformed rows and sorts rows by multiplier', () => {
    const c = normalizeConfig({ coiffeurRows: [
      { id: 'b', label: 'B', multiplier: 2 }, { id: 'x', label: '', multiplier: 3 }, { id: 'a', label: 'A', multiplier: 1 },
    ] });
    expect(c.coiffeurRows.map(r => r.id)).toEqual(['a', 'b']);
  });
  it('defaults: Schieber 1000, all 1×, 10 Coiffeur rows 1..10, 12 Differenzler hands', () => {
    expect(DEFAULT_JASS_CONFIG.schieberTarget).toBe(1000);
    expect(DEFAULT_JASS_CONFIG.suitsDouble || DEFAULT_JASS_CONFIG.topDownTriple || DEFAULT_JASS_CONFIG.slalomQuad).toBe(false);
    expect(DEFAULT_JASS_CONFIG.coiffeurRows.map(r => r.multiplier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
