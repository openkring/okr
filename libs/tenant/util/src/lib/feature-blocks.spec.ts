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
