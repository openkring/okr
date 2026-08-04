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

  // The case above pins a rollout DOC set to `disabled`. This pins the other source of the
  // same verdict — a block whose CATALOGUE DEFAULT is `disabled` and that has no rollout doc
  // at all. `social-feed` and `games` both ship exactly that shape (owner rulings 2026-08-04),
  // and an allow-list must not rescue it the way it rescues `internal`/`beta`.
  it('withholds a block whose catalogue default is disabled, allow-list or not', () => {
    const disabledByDefault = block('a', { defaultAvailability: 'disabled' });
    expect(resolveAvailability(disabledByDefault, undefined, 'scs').offered).toBe(false);
    expect(resolveAvailability(disabledByDefault, rollout('a', { availability: 'disabled', allowTenants: ['scs'] }), 'scs').offered)
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
    // `social-feed`'s real shape (owner ruling 2026-08-04): an unfinished feature withheld
    // from the picker by its CATALOGUE DEFAULT, with no rollout doc.
    block('social-feed', { defaultAvailability: 'disabled' }),
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

  /**
   * THE LEAK VECTOR THIS PINS (added task 17 fix round 2 — nothing covered it before).
   * The D-BB-10 legacy fallback at `feature-rollout.util.ts:55-57` filters `requested` on
   * `!== 'internal'` ONLY, so a block whose catalogue default is `'disabled'` genuinely DOES
   * enter `requested`. The single thing that keeps it out of a tenant's effective set is the
   * `resolveAvailability` gate at `:64-65`. If that gate is ever reordered, narrowed, or moved
   * behind the `core` check, every legacy tenant (`enabledFeatures` still absent from their
   * `app-config` doc) would silently pick up every disabled block on the next deploy.
   * `social-feed` and `games` are the live instances of this shape.
   */
  it('never surfaces a block whose CATALOGUE DEFAULT is disabled, on a legacy config (D-BB-10)', () => {
    const eff = effectiveFeatures({ catalogue, rollouts: [], enabled: undefined, tenantId: 'scs' });
    expect(eff.has('social-feed')).toBe(false);
    // Sanity: the legacy fallback IS otherwise wide open, so the assertion above is not
    // passing for the trivial reason that nothing got through.
    expect(eff.has('person')).toBe(true);
  });

  it('never surfaces a disabled-by-default block even when a tenant explicitly enables it', () => {
    const eff = effectiveFeatures({ catalogue, rollouts: [], enabled: ['social-feed'], tenantId: 'scs' });
    expect(eff.has('social-feed')).toBe(false);
  });

  it('never surfaces a disabled-by-default block dragged in as another block\'s dependency', () => {
    const withDep = [...catalogue, block('needy', { dependsOn: ['social-feed'] })];
    const eff = effectiveFeatures({ catalogue: withDep, rollouts: [], enabled: ['needy'], tenantId: 'scs' });
    expect(eff.has('needy')).toBe(true);
    expect(eff.has('social-feed')).toBe(false);
  });
});
