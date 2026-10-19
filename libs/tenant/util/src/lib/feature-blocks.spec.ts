import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS } from './feature-blocks';
import type { MenuSpec } from './feature-catalogue.types';

/**
 * `blockOfMenuKey` (`feature-routes.util.ts`) is fed a menu doc's `name` — the field
 * `MenuService.read` resolves by (`findByKey(this.list(), name, 'name')`,
 * `menu.service.ts`) — but it matches against every `MenuSpec.key` in the catalogue. That
 * only works if `key === name` on EVERY spec, always. Nothing in the type system pins this
 * (see `MenuSpec`'s doc comment in `feature-catalogue.types.ts`); a block author who writes
 * a spec where they differ — entirely legal per the type — silently breaks the feature-block
 * visibility filter (`MenuStore.menu` in `cms-menu-feature`): the item is misclassified as a
 * tenant-authored entry and always renders, even when its owning block is disabled for the
 * tenant. Nothing goes red anywhere else — this spec is the only thing that catches it.
 *
 * Deliberately asserts against the REAL `FEATURE_BLOCKS`, not a local fixture (contrast with
 * `blockOfMenuKey`'s own tests in `feature-routes.util.spec.ts`, which use a local catalogue
 * specifically to avoid churning as Tasks 12-18 add ~29 more blocks). This assertion is a
 * universal quantifier — "every spec, forever, key === name" — so it does NOT churn as blocks
 * are added; asserting it against the real catalogue is the whole point.
 */
describe('FEATURE_BLOCKS menu spec invariant', () => {
  it('every MenuSpec (recursively, including children) has key === name', () => {
    const mismatches: string[] = [];
    const visit = (blockId: string, spec: MenuSpec): void => {
      if (spec.key !== spec.name) {
        mismatches.push(`block '${blockId}': spec key '${spec.key}' !== name '${spec.name}'`);
      }
      (spec.children ?? []).forEach(child => visit(blockId, child));
    };
    FEATURE_BLOCKS.forEach(block => block.menu.forEach(spec => visit(block.id, spec)));
    expect(mismatches).toEqual([]);
  });
});

/**
 * Spec 1.101 phase 2: every domain's maintenance check sits at the END of that domain's context
 * menu, behind a divider whose `roleNeeded` matches the row. They no longer live under `aoc-menu`.
 */
describe('FEATURE_BLOCKS Wartung rows (1.101 phase 2)', () => {
  const findContext = (name: string) => {
    for (const block of FEATURE_BLOCKS) {
      const hit = block.menu.find(spec => spec.name === name);
      if (hit) return hit;
    }
    return undefined;
  };
  const cases: [string, string, string, string, string, string][] = [
    // context menu, divider, divider role, row, action, row role
    ['c-calevents', 'maint-divider', 'admin', 'calevent-check-duplicates', 'call', 'admin'],
    ['c-groups', 'maint-divider', 'admin', 'group-check-hygiene', 'call', 'admin'],
    ['c-persons', 'maint-divider', 'admin', 'person-check-favaddress', 'call', 'admin'],
    ['c-pages', 'maint-divider-content', 'contentAdmin', 'page-integrity', 'navigate', 'contentAdmin'],
    ['c-documents', 'maint-divider', 'admin', 'document-orphans', 'navigate', 'admin'],
    ['c-trips', 'maint-divider-trip', 'tripAdmin', 'trip-maintenance', 'navigate', 'tripAdmin'],
    ['c-diary', 'maint-divider', 'admin', 'diary-import', 'navigate', 'admin'],
  ];

  it.each(cases)('%s ends with %s then %s', (ctx, divider, dividerRole, row, action, rowRole) => {
    const children = findContext(ctx)?.children ?? [];
    const tail = children.slice(-2);
    expect(tail.map(c => c.name)).toEqual([divider, row]);
    expect(tail[0]).toMatchObject({ action: 'divider', url: '', roleNeeded: dividerRole });
    expect(tail[1]).toMatchObject({ action, roleNeeded: rowRole });
  });

  it('the shared maint-divider doc is field-identical wherever it is declared', () => {
    const seen: string[] = [];
    const visit = (spec: MenuSpec): void => {
      if (spec.name.startsWith('maint-divider')) {
        const { children: _c, ...fields } = spec;
        seen.push(JSON.stringify(Object.entries(fields).sort()) + spec.name);
      }
      (spec.children ?? []).forEach(visit);
    };
    FEATURE_BLOCKS.forEach(b => b.menu.forEach(visit));
    const byName = new Map<string, Set<string>>();
    seen.forEach(s => {
      const name = /(maint-divider[a-z-]*)$/.exec(s)![1];
      byName.set(name, (byName.get(name) ?? new Set()).add(s));
    });
    byName.forEach(variants => expect(variants.size).toBe(1));
  });

  it('none of the new names sits under aoc-menu', () => {
    const aoc = FEATURE_BLOCKS.find(b => b.id === 'aoc')!;
    const names = new Set<string>();
    const visit = (spec: MenuSpec): void => {
      names.add(spec.name);
      (spec.children ?? []).forEach(visit);
    };
    aoc.menu.forEach(visit);
    for (const n of ['maint-divider', 'maint-divider-content', 'maint-divider-trip', 'calevent-check-duplicates', 'group-check-hygiene', 'person-check-favaddress', 'page-integrity', 'document-orphans', 'trip-maintenance', 'diary-import', 'aoc-content', 'aoc-doc', 'aoc-diary']) {
      expect(names.has(n), n).toBe(false);
    }
  });
});
