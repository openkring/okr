import { describe, expect, it } from 'vitest';
import { effectiveFeatures, resolveAvailability } from './feature-rollout.util';
import type { FeatureBlock, FeatureRollout } from './feature-catalogue.types';

const block = (id: string, over: Partial<FeatureBlock> = {}): FeatureBlock => ({
  id, bundle: 'special', label: `@f.${id}`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn: [], menu: [], collections: [],
  ...over,
});

const rollout = (okey: string, over: Partial<FeatureRollout> = {}): FeatureRollout => ({
  okey, availability: 'ga', allowTenants: [], denyTenants: [],
  reason: '', updatedAt: '', updatedBy: '', ...over,
});

describe('resolveAvailability', () => {
  it('falls back to the catalogue default when no rollout doc exists (D-BB-10)', () => {
    expect(resolveAvailability(block('a'), undefined, 'scs').offered).toBe(true);
    expect(resolveAvailability(block('b', { defaultAvailability: 'internal' }), undefined, 'scs').offered)
      .toBe(false);
  });

  it('lets denyTenants win over everything', () => {
    const v = resolveAvailability(block('a'), rollout('a', { denyTenants: ['scs'], reason: 'nope' }), 'scs');
    expect(v.offered).toBe(false);
    expect(v.reason).toBe('nope');
  });

  it('withholds a disabled block from everyone (kill-switch)', () => {
    expect(resolveAvailability(block('a'), rollout('a', { availability: 'disabled' }), 'scs').offered)
      .toBe(false);
  });

  it('offers a beta block only to allow-listed tenants', () => {
    const r = rollout('a', { availability: 'beta', allowTenants: ['demo'] });
    expect(resolveAvailability(block('a'), r, 'demo').offered).toBe(true);
    expect(resolveAvailability(block('a'), r, 'scs').offered).toBe(false);
  });

  it('lets a rollout doc override the catalogue default in both directions', () => {
    const internalBlock = block('a', { defaultAvailability: 'internal' });
    expect(resolveAvailability(internalBlock, rollout('a', { availability: 'ga' }), 'scs').offered)
      .toBe(true);
  });
});

describe('effectiveFeatures', () => {
  const catalogue = [
    block('auth', { core: true }),
    block('person'),
    block('calevent', { dependsOn: ['person'] }),
    block('chat', { defaultAvailability: 'internal' }),
  ];

  it('always includes core blocks regardless of enablement', () => {
    const eff = effectiveFeatures({ catalogue, rollouts: [], enabled: [], tenantId: 'scs' });
    expect(eff.has('auth')).toBe(true);
  });

  it('includes an enabled block and its dependencies', () => {
    const eff = effectiveFeatures({ catalogue, rollouts: [], enabled: ['calevent'], tenantId: 'scs' });
    expect(eff.has('calevent')).toBe(true);
    expect(eff.has('person')).toBe(true);
  });

  it('excludes an enabled block that rollout withholds', () => {
    const eff = effectiveFeatures({
      catalogue, rollouts: [rollout('calevent', { availability: 'disabled' })],
      enabled: ['calevent'], tenantId: 'scs',
    });
    expect(eff.has('calevent')).toBe(false);
  });

  it('treats undefined enabledFeatures as every non-internal block (D-BB-10 legacy)', () => {
    const eff = effectiveFeatures({ catalogue, rollouts: [], enabled: undefined, tenantId: 'scs' });
    expect(eff.has('person')).toBe(true);
    expect(eff.has('calevent')).toBe(true);
    expect(eff.has('chat')).toBe(false);
  });

  it('treats an explicitly empty list as nothing but core', () => {
    const eff = effectiveFeatures({ catalogue, rollouts: [], enabled: [], tenantId: 'scs' });
    expect(eff.has('person')).toBe(false);
    expect(eff.has('auth')).toBe(true);
  });
});
