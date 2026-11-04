import { describe, expect, it } from 'vitest';

import { ENERGY_SECTION_SHAPE, EnergyConfig, EnergySection } from '@okr/shared-models';

import { ENERGY_MAX_COMPARE, energySectionValidations } from './energy-section.validations';

/**
 * Both messages are BLANK vest keys, resolved as `validation.<key>` from each app's main i18n
 * bundle (see weather-section.validations.spec.ts). This spec pins the key names so a rename
 * cannot silently walk away from the bundles.
 */
const section = (config: Partial<EnergyConfig>): EnergySection => ({
  ...ENERGY_SECTION_SHAPE,
  okey: 'k', name: 'n', title: 't', tenants: ['t1'],
  properties: { locationKey: 'a', compareKeys: [], ...config },
} as EnergySection);

const messagesFor = (model: EnergySection, field: string): string[] =>
  energySectionValidations(model).getErrors()[field] ?? [];

describe('energySectionValidations', () => {
  it('requires a location', () => {
    const result = energySectionValidations(section({ locationKey: '', compareKeys: [] }));
    expect(result.hasErrors('locationKey')).toBe(true);
    expect(messagesFor(section({ locationKey: '' }), 'locationKey')).toContain('energyLocationRequired');
  });

  it('accepts a location with no comparison', () => {
    expect(energySectionValidations(section({ locationKey: 'a', compareKeys: [] })).hasErrors('locationKey')).toBe(false);
    expect(energySectionValidations(section({ locationKey: 'a', compareKeys: [] })).hasErrors('compareKeys')).toBe(false);
  });

  it('allows up to four comparisons', () => {
    expect(ENERGY_MAX_COMPARE).toBe(4);
    expect(energySectionValidations(section({ locationKey: 'a', compareKeys: ['b', 'c', 'd', 'e'] })).hasErrors('compareKeys')).toBe(false);
    expect(energySectionValidations(section({ locationKey: 'a', compareKeys: ['b', 'c', 'd', 'e', 'f'] })).hasErrors('compareKeys')).toBe(true);
    expect(messagesFor(section({ locationKey: 'a', compareKeys: ['b', 'c', 'd', 'e', 'f'] }), 'compareKeys')).toContain('energyCompareCount');
  });

  it('rejects the main location as its own comparison', () => {
    expect(energySectionValidations(section({ locationKey: 'a', compareKeys: ['a'] })).hasErrors('compareKeys')).toBe(true);
    expect(messagesFor(section({ locationKey: 'a', compareKeys: ['b', 'a'] }), 'compareKeys')).toContain('energyCompareCount');
  });

  it('tolerates a legacy document without compareKeys', () => {
    const legacy = section({});
    delete (legacy.properties as Partial<EnergyConfig>).compareKeys;
    expect(energySectionValidations(legacy).hasErrors('compareKeys')).toBe(false);
  });

  it('uses no @-prefixed key', () => {
    for (const key of ['energyLocationRequired', 'energyCompareCount']) expect(key.startsWith('@')).toBe(false);
  });
});
