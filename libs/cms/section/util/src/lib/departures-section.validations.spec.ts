import { describe, expect, it } from 'vitest';

import { DeparturesSection } from '@okr/shared-models';

import { departuresSectionValidations } from './departures-section.validations';

/**
 * The message keys are BLANK vest keys, resolved as `validation.<key>` from each app's main bundle
 * (see weather-section.validations.spec.ts). Pinned here so a rename cannot walk away from the bundles.
 */
const section = (properties: Partial<DeparturesSection['properties']>): DeparturesSection => ({
  okey: 'k', type: 'departures', state: 'published', name: 'n', title: 't', subTitle: '',
  index: '', color: 0, colSize: '12', roleNeeded: 'registered', isArchived: false,
  content: {} as DeparturesSection['content'], notes: '', tags: '', tenants: ['t1'],
  properties: { locationKey: 'loc1', stopRef: '', stopName: '', limit: 8, walkMinutes: -1, ...properties },
} as DeparturesSection);

const messagesFor = (model: DeparturesSection, field: string): string[] =>
  departuresSectionValidations(model).getErrors()[field] ?? [];

describe('departuresSectionValidations', () => {
  it('accepts the defaults', () => {
    expect(departuresSectionValidations(section({})).hasErrors()).toBe(false);
  });

  it('lets the location be empty: the location of the page is used', () => {
    expect(messagesFor(section({ locationKey: '' }), 'locationKey')).toEqual([]);
  });

  it('keeps the limit within 1..20', () => {
    expect(messagesFor(section({ limit: 0 }), 'limit')).toContain('departuresLimitRange');
    expect(messagesFor(section({ limit: 21 }), 'limit')).toContain('departuresLimitRange');
    expect(messagesFor(section({ limit: 20 }), 'limit')).toEqual([]);
  });

  it('keeps a given walk within 0..60 minutes, -1 = derived', () => {
    expect(messagesFor(section({ walkMinutes: 61 }), 'walkMinutes')).toContain('departuresWalkRange');
    expect(messagesFor(section({ walkMinutes: 0 }), 'walkMinutes')).toEqual([]);
    expect(messagesFor(section({}), 'walkMinutes')).toEqual([]);
    expect(messagesFor(section({ walkMinutes: -2 }), 'walkMinutes')).toContain('departuresWalkRange');
  });
});
