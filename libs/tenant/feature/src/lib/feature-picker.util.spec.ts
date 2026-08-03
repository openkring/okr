import { describe, expect, it } from 'vitest';
import { blocksRemovedBySave, dependentsOf, transitiveDependentsOf } from './feature-picker.util';
import type { FeatureBlock, FeatureRollout } from '@okr/tenant-util';

// `FeatureBlock` (feature-catalogue.types.ts) has no `routes` field — that lives in
// `@okr/tenant-routes`'s `BlockRoutes` now (split out to break a circular dependency, see
// that type's doc comment). The brief's fixture predates the split; build it from the real
// fields only.
const block = (id: string, dependsOn: string[] = [], overrides: Partial<FeatureBlock> = {}): FeatureBlock => ({
  id, bundle: 'special', label: `@feature.${id}.label`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn, menu: [], collections: [], ...overrides,
});

describe('dependentsOf', () => {
  const catalogue = [
    block('person'), block('calevent', ['person']),
    block('finance', ['person']), block('esign', ['finance']),
  ];

  it('lists blocks that directly depend on the given block', () => {
    expect(dependentsOf(catalogue, 'person').sort()).toEqual(['calevent', 'finance']);
  });

  it('returns only the direct dependent of an intermediate node, not its own dependants', () => {
    // 'esign' depends on 'finance', not on 'person' directly — dependentsOf is one hop only,
    // by design (see its doc comment); the transitive chain is `transitiveDependentsOf`'s job.
    expect(dependentsOf(catalogue, 'finance')).toEqual(['esign']);
  });

  it('returns an empty list for a leaf', () => {
    expect(dependentsOf(catalogue, 'esign')).toEqual([]);
  });
});

describe('transitiveDependentsOf', () => {
  const catalogue = [
    block('person'), block('calevent', ['person']),
    block('finance', ['person']), block('esign', ['finance']),
  ];

  it('walks the full chain: person -> calevent, finance -> esign', () => {
    expect(transitiveDependentsOf(catalogue, 'person', new Set(['person', 'calevent', 'finance', 'esign'])).sort())
      .toEqual(['calevent', 'esign', 'finance']);
  });

  it('only reports dependants that are currently selected', () => {
    // 'esign' depends on 'finance' but is not ticked — no warning needed for it.
    expect(transitiveDependentsOf(catalogue, 'person', new Set(['person', 'calevent', 'finance'])).sort())
      .toEqual(['calevent', 'finance']);
  });

  it('returns an empty list for a leaf', () => {
    expect(transitiveDependentsOf(catalogue, 'esign', new Set(['person', 'calevent', 'finance', 'esign']))).toEqual([]);
  });
});

describe('blocksRemovedBySave', () => {
  const tenantId = 'tenantX';
  const noRollouts: FeatureRollout[] = [];

  it('case 1 — legacy first save: undefined -> a subset names exactly what is dropped', () => {
    const catalogue = [block('calevent'), block('aoc')];
    expect(blocksRemovedBySave({
      catalogue, rollouts: noRollouts, currentEnabled: undefined, nextEnabled: ['calevent'], tenantId,
    })).toEqual(['aoc']);
  });

  it('case 2 — an unmodified first save (ticking everything already on) is a safe no-op', () => {
    const catalogue = [block('calevent'), block('aoc')];
    expect(blocksRemovedBySave({
      catalogue, rollouts: noRollouts, currentEnabled: undefined, nextEnabled: ['calevent', 'aoc'], tenantId,
    })).toEqual([]);
  });

  it('case 3 — dropping one of two independent blocks names only that one', () => {
    const catalogue = [block('a'), block('b')];
    expect(blocksRemovedBySave({
      catalogue, rollouts: noRollouts, currentEnabled: ['a', 'b'], nextEnabled: ['a'], tenantId,
    })).toEqual(['b']);
  });

  it('case 4 — cascade: dropping a dependency also lists its dependants', () => {
    const catalogue = [block('finance'), block('esign', ['finance'])];
    expect(blocksRemovedBySave({
      catalogue, rollouts: noRollouts, currentEnabled: ['finance', 'esign'], nextEnabled: [], tenantId,
    }).sort()).toEqual(['esign', 'finance']);
  });

  it('case 5 — REGRESSION GUARD: currentEnabled: undefined must NOT behave like []', () => {
    const catalogue = [block('calevent'), block('finance'), block('esign', ['finance'])];
    const input = { catalogue, rollouts: noRollouts, nextEnabled: [] as string[], tenantId };

    // undefined (D-BB-10: no rollout doc yet) means "everything not-internal was on" — saving
    // an empty selection removes all three.
    expect(blocksRemovedBySave({ ...input, currentEnabled: undefined }).sort())
      .toEqual(['calevent', 'esign', 'finance']);

    // A literal [] means "explicitly nothing was on" — saving an empty selection removes
    // nothing. If `effectiveFeatures` (or this function) ever collapsed `undefined` into `[]`,
    // these two assertions would become identical and this test would stop catching it.
    expect(blocksRemovedBySave({ ...input, currentEnabled: [] })).toEqual([]);
  });
});
