import { describe, expect, it } from 'vitest';
import { MenuItemModel } from '@okr/shared-models';
import type { FeatureBlock } from './feature-catalogue.types';
import { classifyMenuOwnership, forkTargetKey, isCatalogueOwned } from './menu-ownership.util';

/**
 * A miniature catalogue. `aoc-menu` is deliberately declared by TWO blocks, mirroring the real
 * shared-parent case (`aoc` + the always-core `user`/`security`) that `blockOwnersOfMenuKey`
 * exists for — the classifier must report both owners, not just the first.
 */
const CATALOGUE = [
  { id: 'aoc', menu: [{ key: 'aoc-menu', children: [{ key: 'tenant-features' }] }] },
  { id: 'security', menu: [{ key: 'aoc-menu' }] },
  { id: 'calevent', menu: [{ key: 'calevent-all' }] },
] as unknown as FeatureBlock[];

function doc(over: Partial<MenuItemModel>): MenuItemModel {
  return { ...new MenuItemModel('elab'), ...over };
}

describe('classifyMenuOwnership', () => {
  it('reports a hand-written menu entry as tenant-owned, with no owners', () => {
    const result = classifyMenuOwnership(doc({ name: 'my-own-row', tenants: ['elab'] }), 'elab', CATALOGUE);

    expect(result.kind).toBe('tenant-owned');
    expect(result.owners).toEqual([]);
    // Nothing about a tenant-authored row is at risk, so nothing should be warned about.
    expect(result.willFork).toBe(false);
  });

  it('reports a catalogue key still shared with other tenants as catalogue-shared', () => {
    const result = classifyMenuOwnership(doc({ name: 'aoc-menu', tenants: ['elab', 'scs'] }), 'elab', CATALOGUE);

    expect(result.kind).toBe('catalogue-shared');
    // BOTH declaring blocks — checking only the first is the bug blockOwnersOfMenuKey exists for.
    expect(result.owners).toEqual(['aoc', 'security']);
  });

  it('flags that editing a shared doc will fork it, and names the resulting doc id', () => {
    const result = classifyMenuOwnership(doc({ name: 'aoc-menu', tenants: ['elab', 'scs'] }), 'elab', CATALOGUE);

    expect(result.willFork).toBe(true);
    expect(result.forkTargetKey).toBe('aoc-menu_elab');
  });

  it('does NOT fork a catalogue doc this tenant already owns alone', () => {
    const result = classifyMenuOwnership(doc({ name: 'calevent-all', tenants: ['elab'] }), 'elab', CATALOGUE);

    expect(result.kind).toBe('catalogue-shared');
    expect(result.willFork).toBe(false);
    expect(result.forkTargetKey).toBeUndefined();
  });

  it('reports an already-forked doc as catalogue-forked and never forks it again', () => {
    const result = classifyMenuOwnership(
      doc({ name: 'aoc-menu', tenants: ['elab'], forkedFrom: 'aoc-menu' }), 'elab', CATALOGUE,
    );

    expect(result.kind).toBe('catalogue-forked');
    expect(result.willFork).toBe(false);
    expect(result.forkedFrom).toBe('aoc-menu');
  });

  it('classifies a nested catalogue key by its declaring block, not its parent', () => {
    const result = classifyMenuOwnership(doc({ name: 'tenant-features', tenants: ['elab', 'scs'] }), 'elab', CATALOGUE);

    expect(result.kind).toBe('catalogue-shared');
    expect(result.owners).toEqual(['aoc']);
  });

  it('does not fork a doc scoped to other tenants only — there is nothing to detach', () => {
    // MenuService.fork() skips this case: a copy would leave two resolvable docs for one name.
    const result = classifyMenuOwnership(doc({ name: 'aoc-menu', tenants: ['scs'] }), 'elab', CATALOGUE);

    expect(result.willFork).toBe(false);
  });
});

describe('isCatalogueOwned', () => {
  it('is true for a key any block declares and false for a hand-written one', () => {
    expect(isCatalogueOwned('aoc-menu', CATALOGUE)).toBe(true);
    expect(isCatalogueOwned('my-own-row', CATALOGUE)).toBe(false);
  });
});

describe('forkTargetKey', () => {
  it('mirrors MenuService.fork: <name>_<tenantId>', () => {
    expect(forkTargetKey(doc({ name: 'aoc-menu' }), 'elab')).toBe('aoc-menu_elab');
  });
});
