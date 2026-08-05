import { describe, expect, it } from 'vitest';
import { deriveEnabledFeatures } from './feature-backfill.util';
import type { MenuDocInput } from './feature-backfill.util';
import { FEATURE_BLOCKS } from './feature-blocks';
import type { FeatureBlock, FeatureRollout, MenuSpec } from './feature-catalogue.types';

const spec = (key: string, children?: MenuSpec[]): MenuSpec => ({
  key, name: key, url: '', action: 'sub', roleNeeded: 'registered',
  icon: 'help-circle', label: '', ...(children ? { children } : {}),
});

const block = (id: string, over: Partial<FeatureBlock> = {}): FeatureBlock => ({
  id, bundle: 'special', label: `@f.${id}`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn: [], menu: [], collections: [],
  ...over,
});

const rollout = (okey: string, over: Partial<FeatureRollout> = {}): FeatureRollout => ({
  okey, availability: 'ga', allowTenants: [], denyTenants: [],
  reason: '', updatedAt: '', updatedBy: '', ...over,
});

const doc = (name: string, tenants: string[], over: Partial<MenuDocInput> = {}): MenuDocInput => ({
  okey: `autoid-${name}`, name, tenants, isArchived: false, ...over,
});

/**
 * A miniature stand-in for the real shared-parent pattern: `shared-menu` is co-declared by
 * `alpha` and `beta`; only `alpha` also owns an exclusive child.
 */
const sharedParentCatalogue: FeatureBlock[] = [
  block('alpha', { menu: [spec('shared-menu', [spec('alpha-all')])] }),
  block('beta', { menu: [spec('shared-menu', [spec('beta-all')])] }),
];

const derive = (
  catalogue: FeatureBlock[],
  menuDocs: MenuDocInput[],
  over: { rollouts?: FeatureRollout[]; tenantId?: string; policy?: 'exclusive' | 'corroborated' | 'all' } = {},
) => deriveEnabledFeatures({
  catalogue,
  rollouts: over.rollouts ?? [],
  menuDocs,
  tenantId: over.tenantId ?? 't1',
  policy: over.policy,
});

describe('deriveEnabledFeatures — attribution policy', () => {
  it("'exclusive' (the default) refuses to attribute a co-declared shared parent", () => {
    // The tenant has the shared parent and alpha's exclusive child, but nothing of beta's.
    const docs = [doc('shared-menu', ['t1']), doc('alpha-all', ['t1'])];
    const out = derive(sharedParentCatalogue, docs);
    expect(out.policy).toBe('exclusive');
    expect(out.enabled).toEqual(['alpha']);
    expect(out.evidence).toEqual({ alpha: ['alpha-all'] });
  });

  it("'all' over-attributes the same data to every declaring block", () => {
    const docs = [doc('shared-menu', ['t1']), doc('alpha-all', ['t1'])];
    const out = derive(sharedParentCatalogue, docs, { policy: 'all' });
    expect(out.enabled).toEqual(['alpha', 'beta']);
    expect(out.evidence['beta']).toEqual(['shared-menu']);
  });

  it("'corroborated' is set-identical to 'exclusive' but records richer evidence", () => {
    const docs = [doc('shared-menu', ['t1']), doc('alpha-all', ['t1'])];
    const exclusive = derive(sharedParentCatalogue, docs, { policy: 'exclusive' });
    const corroborated = derive(sharedParentCatalogue, docs, { policy: 'corroborated' });
    expect(corroborated.enabled).toEqual(exclusive.enabled);
    expect(corroborated.evidence['alpha']).toEqual(['alpha-all', 'shared-menu']);
    expect(exclusive.evidence['alpha']).toEqual(['alpha-all']);
  });

  it('attributes nothing at all when the tenant owns only the shared parent', () => {
    const out = derive(sharedParentCatalogue, [doc('shared-menu', ['t1'])]);
    expect(out.enabled).toEqual([]);
    expect(out.evidence).toEqual({});
  });
});

describe('deriveEnabledFeatures — document selection', () => {
  it('matches a doc by its `name` field, not by its Firestore id', () => {
    // Live menu docs are overwhelmingly autoid-keyed; matching on the id misses them.
    const out = derive(sharedParentCatalogue, [{ okey: 'k3j4h5', name: 'alpha-all', tenants: ['t1'] }]);
    expect(out.enabled).toEqual(['alpha']);
  });

  it('ignores archived docs and docs belonging to another tenant', () => {
    const docs = [
      doc('alpha-all', ['t1'], { isArchived: true }),
      doc('beta-all', ['t2']),
    ];
    const out = derive(sharedParentCatalogue, docs);
    expect(out.enabled).toEqual([]);
    expect(out.docCount).toBe(0);
  });

  it('selects content by the tenant id it is GIVEN — the caller must pass the app-config doc id', () => {
    // Pins the identity contract. `app-config/demo` and `app-config/elab` both carry a stale
    // `tenantId: "test"` FIELD, but the whole system joins on the DOCUMENT ID: the app reads
    // app-config via `.doc(env.tenantId)` and queries content with `tenants array-contains`
    // the same string, `set-env.js` derives it from the Nx project name, and
    // `apply-feature-selection.ts` reuses it for the config doc, `tenants: [tenantId]` and
    // `main_<tenantId>`. Nothing queries the field. Deriving 'demo' must therefore look at
    // 'demo' content and find none — NOT silently fall through to 'test' content.
    const docs = [doc('alpha-all', ['test']), doc('beta-all', ['test'])];
    expect(derive(sharedParentCatalogue, docs, { tenantId: 'demo' }).enabled).toEqual([]);
    expect(derive(sharedParentCatalogue, docs, { tenantId: 'test' }).enabled).toEqual(['alpha', 'beta']);
  });

  it('reports tenant-authored names as uncatalogued without attributing them', () => {
    const out = derive(sharedParentCatalogue, [doc('scs-news', ['t1']), doc('alpha-all', ['t1'])]);
    expect(out.uncatalogued).toEqual(['scs-news']);
    expect(out.enabled).toEqual(['alpha']);
  });
});

describe('deriveEnabledFeatures — core, dependencies and the availability gate', () => {
  it('unions in every core block even with no evidence for it', () => {
    const catalogue = [block('core-a', { core: true }), block('opt-a')];
    const out = derive(catalogue, []);
    expect(out.enabled).toEqual(['core-a']);
    expect(out.coreOnly).toEqual(['core-a']);
  });

  it('closes over transitive dependencies and flags the dep-only additions', () => {
    const catalogue = [
      block('leaf', { dependsOn: ['mid'], menu: [spec('leaf-all')] }),
      block('mid', { dependsOn: ['root'] }),
      block('root'),
    ];
    const out = derive(catalogue, [doc('leaf-all', ['t1'])]);
    expect(out.enabled).toEqual(['leaf', 'mid', 'root']);
    expect(out.depsOnly).toEqual(['mid', 'root']);
  });

  it('drops a `disabled` block even when the tenant has its menu doc', () => {
    const catalogue = [block('dead', { defaultAvailability: 'disabled', menu: [spec('dead-all')] })];
    const out = derive(catalogue, [doc('dead-all', ['t1'])]);
    expect(out.enabled).toEqual([]);
    expect(out.gatedOut).toEqual([{ id: 'dead', availability: 'disabled' }]);
  });

  it('drops a CORE block that a rollout doc disables — core bypasses enablement, not rollout', () => {
    const catalogue = [block('core-a', { core: true })];
    const out = derive(catalogue, [], { rollouts: [rollout('core-a', { availability: 'disabled' })] });
    expect(out.enabled).toEqual([]);
  });

  it('drops a block for a tenant on its rollout denyTenants list only', () => {
    const catalogue = [block('opt-a', { menu: [spec('a-all')] })];
    const docs = [doc('a-all', ['t1', 't2'])];
    const rollouts = [rollout('opt-a', { denyTenants: ['t1'] })];
    expect(derive(catalogue, docs, { rollouts, tenantId: 't1' }).enabled).toEqual([]);
    expect(derive(catalogue, docs, { rollouts, tenantId: 't2' }).enabled).toEqual(['opt-a']);
  });

  it('drops a beta block unless the tenant is explicitly allowed', () => {
    const catalogue = [block('beta-a', { defaultAvailability: 'beta', menu: [spec('b-all')] })];
    const docs = [doc('b-all', ['t1', 't2'])];
    const rollouts = [rollout('beta-a', { availability: 'beta', allowTenants: ['t2'] })];
    expect(derive(catalogue, docs, { rollouts, tenantId: 't1' }).enabled).toEqual([]);
    expect(derive(catalogue, docs, { rollouts, tenantId: 't2' }).enabled).toEqual(['beta-a']);
  });

  it('gates a dependency too — an evidenced block cannot smuggle a disabled dep in', () => {
    const catalogue = [
      block('opt-a', { dependsOn: ['dead'], menu: [spec('a-all')] }),
      block('dead', { defaultAvailability: 'disabled' }),
    ];
    const out = derive(catalogue, [doc('a-all', ['t1'])]);
    expect(out.enabled).toEqual(['opt-a']);
    expect(out.gatedOut.map(g => g.id)).toEqual(['dead']);
  });
});

describe('deriveEnabledFeatures — owner override (R-8)', () => {
  const override = (ids: string[]) => ({
    ruling: 'R-8', date: '2026-08-05', reason: 'test', ids,
  });

  it('replaces the derived set with the ruling, and reports what it overrode', () => {
    const catalogue = [block('alpha', { menu: [spec('alpha-all')] }), block('beta'), block('gamma')];
    const out = deriveEnabledFeatures({
      catalogue, rollouts: [], menuDocs: [doc('alpha-all', ['t1'])], tenantId: 't1',
      override: override(['beta', 'gamma']),
    });
    expect(out.enabled).toEqual(['beta', 'gamma']);
    expect(out.derivedInstead).toEqual(['alpha']);   // the evidence is still computed
    expect(out.evidence).toEqual({ alpha: ['alpha-all'] });
    expect(out.override?.ruling).toBe('R-8');
  });

  it('CANNOT smuggle a disabled block past the gate', () => {
    // The whole safety argument for allowing overrides at all. An owner ruling replaces the
    // request, never the gate.
    const catalogue = [block('dead', { defaultAvailability: 'disabled' }), block('ok')];
    const out = deriveEnabledFeatures({
      catalogue, rollouts: [], menuDocs: [], tenantId: 't1',
      override: override(['dead', 'ok']),
    });
    expect(out.enabled).toEqual(['ok']);
    expect(out.gatedOut.map(g => g.id)).toEqual(['dead']);
  });

  it('CANNOT bypass a denyTenants entry', () => {
    const catalogue = [block('opt-a')];
    const out = deriveEnabledFeatures({
      catalogue, rollouts: [rollout('opt-a', { denyTenants: ['t1'] })],
      menuDocs: [], tenantId: 't1', override: override(['opt-a']),
    });
    expect(out.enabled).toEqual([]);
  });

  it('still unions core blocks in', () => {
    const catalogue = [block('core-a', { core: true }), block('opt-a')];
    const out = deriveEnabledFeatures({
      catalogue, rollouts: [], menuDocs: [], tenantId: 't1', override: override(['opt-a']),
    });
    expect(out.enabled).toEqual(['core-a', 'opt-a']);
  });

  it('the R-8 shape — every catalogue id in, every non-disabled block out', () => {
    // Exactly what the script asks for okr: hand it the whole catalogue and let the gate
    // subtract. Nothing names social-feed or games.
    const expected = FEATURE_BLOCKS
      .filter(b => b.defaultAvailability !== 'disabled').map(b => b.id).sort();
    const out = deriveEnabledFeatures({
      catalogue: FEATURE_BLOCKS, rollouts: [], menuDocs: [], tenantId: 'okr',
      override: override(FEATURE_BLOCKS.map(b => b.id)),
    });
    expect(out.enabled).toEqual(expected);
    expect(out.enabled).toHaveLength(28);
    FEATURE_BLOCKS.filter(b => b.defaultAvailability === 'disabled')
      .forEach(b => expect(out.enabled).not.toContain(b.id));
  });
});

describe('deriveEnabledFeatures — against the real catalogue', () => {
  const realDocs = (names: string[], tenantId: string): MenuDocInput[] =>
    names.map(n => doc(n, [tenantId]));

  it('never proposes a disabled block, without naming social-feed or games anywhere', () => {
    const disabled = FEATURE_BLOCKS.filter(b => b.defaultAvailability === 'disabled').map(b => b.id);
    expect(disabled.length).toBeGreaterThan(0); // guards the test against a vacuous pass
    // Feed EVERY catalogued menu key in, i.e. the most generous possible evidence.
    const everyKey: string[] = [];
    const walk = (s: MenuSpec): void => { everyKey.push(s.key); (s.children ?? []).forEach(walk); };
    FEATURE_BLOCKS.forEach(b => b.menu.forEach(walk));
    const out = deriveEnabledFeatures({
      catalogue: FEATURE_BLOCKS, rollouts: [], menuDocs: realDocs(everyKey, 'scs'),
      tenantId: 'scs', policy: 'all',
    });
    disabled.forEach(id => expect(out.enabled).not.toContain(id));

    // The assertion above is true partly by construction (both disabled blocks declare no
    // menu and nothing depends on them), so it would still pass with the gate ripped out.
    // Prove the gate is LIVE against the real catalogue: disable an otherwise-healthy,
    // heavily-evidenced block via a rollout doc and require it to disappear. This is also
    // what makes the "no hardcoded ids" claim testable — nothing here names social-feed or
    // games, and a third disabled block would be handled by the same code path.
    const gated = deriveEnabledFeatures({
      catalogue: FEATURE_BLOCKS,
      rollouts: [rollout('calevent', { availability: 'disabled' })],
      menuDocs: realDocs(everyKey, 'scs'), tenantId: 'scs', policy: 'all',
    });
    expect(out.enabled).toContain('calevent');
    expect(gated.enabled).not.toContain('calevent');
    expect(gated.gatedOut.map(g => g.id)).toContain('calevent');
  });

  it("does not attribute `mobility` or `activity` to a tenant whose only AOC doc is the shared parent", () => {
    // The exact p13-shaped case: the AOC submenu exists, but flighttracker/activity-all do not.
    const docs = realDocs(['aoc-menu', 'aoc-admin'], 'p13');
    const exclusive = deriveEnabledFeatures({
      catalogue: FEATURE_BLOCKS, rollouts: [], menuDocs: docs, tenantId: 'p13', policy: 'exclusive',
    });
    expect(exclusive.enabled).toContain('aoc');
    expect(exclusive.enabled).not.toContain('mobility');
    expect(exclusive.enabled).not.toContain('activity');

    const all = deriveEnabledFeatures({
      catalogue: FEATURE_BLOCKS, rollouts: [], menuDocs: docs, tenantId: 'p13', policy: 'all',
    });
    expect(all.enabled).toContain('mobility');
    expect(all.enabled).toContain('activity');
  });

  it('every non-core block reachable by evidence owns at least one exclusively-declared key', () => {
    // Pins the premise the 'exclusive' policy rests on: shared PARENTS are shared, their
    // CHILDREN are not. Failure here means 'exclusive' has started under-attributing.
    const owners = new Map<string, string[]>();
    const walk = (id: string, s: MenuSpec): void => {
      owners.set(s.key, [...(owners.get(s.key) ?? []), id]);
      (s.children ?? []).forEach(c => walk(id, c));
    };
    FEATURE_BLOCKS.forEach(b => b.menu.forEach(s => walk(b.id, s)));

    const withoutExclusive = FEATURE_BLOCKS
      .filter(b => !b.core && b.defaultAvailability !== 'disabled')
      .filter(b => {
        const keys: string[] = [];
        const collect = (s: MenuSpec): void => { keys.push(s.key); (s.children ?? []).forEach(collect); };
        b.menu.forEach(collect);
        return !keys.some(k => (owners.get(k) ?? []).length === 1);
      })
      .map(b => b.id);

    // `vcard` and `instruments` declare no menu at all — the documented coverage gap.
    expect(withoutExclusive).toEqual(['instruments', 'vcard']);
  });
});
