import { describe, expect, it } from 'vitest';
import { dependentsOf } from './feature-picker.util';
import type { FeatureBlock } from '@okr/tenant-util';

// `FeatureBlock` (feature-catalogue.types.ts) has no `routes` field — that lives in
// `@okr/tenant-routes`'s `BlockRoutes` now (split out to break a circular dependency, see
// that type's doc comment). The brief's fixture predates the split; build it from the real
// fields only.
const block = (id: string, dependsOn: string[] = []): FeatureBlock => ({
  id, bundle: 'special', label: `@feature.${id}.label`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn, menu: [], collections: [],
});

describe('dependentsOf', () => {
  const catalogue = [
    block('person'), block('calevent', ['person']),
    block('finance', ['person']), block('esign', ['finance']),
  ];

  it('lists blocks that directly depend on the given block', () => {
    expect(dependentsOf(catalogue, 'person').sort()).toEqual(['calevent', 'finance']);
  });

  it('includes transitive dependants', () => {
    expect(dependentsOf(catalogue, 'finance')).toEqual(['esign']);
  });

  it('returns an empty list for a leaf', () => {
    expect(dependentsOf(catalogue, 'esign')).toEqual([]);
  });
});
