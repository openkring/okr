import { describe, expect, it } from 'vitest';

import { COUNTER_SECTION_SHAPE, CounterConfig, CounterSection } from '@okr/shared-models';

import { COUNTER_LABEL_LENGTH, COUNTER_MAX_INTERVAL, COUNTER_MIN_INTERVAL, counterSectionValidations } from './counter-section.validations';

const section = (config: Partial<CounterConfig>): CounterSection => ({
  ...COUNTER_SECTION_SHAPE,
  okey: 'k', name: 'n', title: 't', tenants: ['t1'],
  properties: { ...COUNTER_SECTION_SHAPE.properties, ...config },
} as CounterSection);

const hasErrors = (config: Partial<CounterConfig>, field: string): boolean =>
  counterSectionValidations(section(config)).hasErrors(field);

describe('counterSectionValidations', () => {
  it('accepts the default shape', () => {
    expect(counterSectionValidations(section({})).hasErrors()).toBe(false);
  });

  it('caps the label length', () => {
    expect(hasErrors({ label: 'x'.repeat(COUNTER_LABEL_LENGTH) }, 'counter.label')).toBe(false);
    expect(hasErrors({ label: 'x'.repeat(COUNTER_LABEL_LENGTH + 1) }, 'counter.label')).toBe(true);
  });

  it('rejects an unknown ui type', () => {
    expect(hasErrors({ uiType: 'ring' }, 'counter.uiType')).toBe(false);
    expect(hasErrors({ uiType: 'dial' as CounterConfig['uiType'] }, 'counter.uiType')).toBe(true);
  });

  it('keeps the interval within its bounds', () => {
    expect(hasErrors({ autoInterval: COUNTER_MIN_INTERVAL }, 'counter.autoInterval')).toBe(false);
    expect(hasErrors({ autoInterval: COUNTER_MAX_INTERVAL }, 'counter.autoInterval')).toBe(false);
    expect(hasErrors({ autoInterval: COUNTER_MIN_INTERVAL - 1 }, 'counter.autoInterval')).toBe(true);
    expect(hasErrors({ autoInterval: 1500.5 }, 'counter.autoInterval')).toBe(true);
  });

  it('rejects an unknown direction', () => {
    expect(hasErrors({ autoDirection: 'down' }, 'counter.autoDirection')).toBe(false);
    expect(hasErrors({ autoDirection: 'sideways' as CounterConfig['autoDirection'] }, 'counter.autoDirection')).toBe(true);
  });
});
