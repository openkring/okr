import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS } from '@okr/tenant-util';
import type { MenuSpec } from '@okr/tenant-util';
import { NON_BLOCK_DOMAINS, PENDING_CLASSIFICATION } from './feature-catalogue.non-blocks';

/** Repo-root-relative path to libs/, from this spec file's directory. */
const LIBS_DIR = join(__dirname, '../../../../..', 'libs');

/**
 * A top-level domain "has a feature lib" if `libs/<name>/feature` exists (flat domains
 * like `calevent`) OR `libs/<name>/<sub>/feature` exists for any subdomain (container
 * domains like `finance`, whose 13 subdomains each carry their own layer split). Per the
 * repo owner's ruling, one catalogue block covers a whole container domain — e.g. one
 * `finance` block for all finance subdomains — so completeness is judged, and each domain
 * returned, at the TOP level only (deduplicated), never per-subdomain. Depth is capped at
 * 2; no depth-3 `feature` directory exists today, and an unbounded walk would be slower
 * and risk false positives from `node_modules`/`dist`.
 */
function featureDomains(): string[] {
  const topLevel = readdirSync(LIBS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'node_modules')
    .map(e => e.name);

  return topLevel.filter(name => {
    const domainDir = join(LIBS_DIR, name);
    if (existsSync(join(domainDir, 'feature'))) return true;
    return readdirSync(domainDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .some(e => existsSync(join(domainDir, e.name, 'feature')));
  });
}

describe('catalogue completeness', () => {
  it('every libs/*/feature domain is a block or an explicit non-block', () => {
    const known = new Set([
      ...FEATURE_BLOCKS.map(b => b.id),
      ...Object.keys(NON_BLOCK_DOMAINS),
      ...PENDING_CLASSIFICATION,
    ]);
    const unclassified = featureDomains().filter(d => !known.has(d));
    expect(unclassified).toEqual([]);
  });

  it('block ids are unique', () => {
    const ids = FEATURE_BLOCKS.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every dependsOn target exists in the catalogue', () => {
    const ids = new Set(FEATURE_BLOCKS.map(b => b.id));
    const dangling = FEATURE_BLOCKS
      .flatMap(b => b.dependsOn.map(d => ({ block: b.id, dep: d })))
      .filter(({ dep }) => !ids.has(dep));
    expect(dangling).toEqual([]);
  });

  /**
   * A key legitimately recurs across blocks EXACTLY ONCE per genuine use case: a shared
   * PARENT doc (`cms-menu`, `aoc-menu`) that multiple blocks each redeclare, verbatim,
   * purely to attach their own child(ren) — see `cmsMenuParent`/`aocMenuParent` in
   * `feature-blocks.ts` (task 12 review round 2) and `planMenuOpsForBlocks`'s "BUG 1 FIX"
   * (`apps/functions/src/tenant/apply-feature-selection.ts`), which folds every block's
   * redeclaration into ONE Firestore write. That is a deliberate, field-identical
   * co-declaration — NOT the same as two blocks colliding on a key by accident, which
   * would silently corrupt the shared doc's own fields depending on write order. This test
   * enforces the narrower, correct invariant: every KEY's "own" fields (everything except
   * `children`, which legitimately differs per redeclaration) must be identical everywhere
   * that key appears, and every block's OWN tree must never repeat a key internally.
   */
  it('a menu key that recurs across blocks always describes the same node (shared-parent co-declarations only, no accidental collisions)', () => {
    type OwnFields = Omit<MenuSpec, 'children'>;
    const seen = new Map<string, OwnFields>();
    const conflicts: string[] = [];

    const visit = (spec: MenuSpec): void => {
      const { children: _children, ...own } = spec;
      const prior = seen.get(spec.key);
      if (prior && JSON.stringify(prior) !== JSON.stringify(own)) {
        conflicts.push(spec.key);
      }
      seen.set(spec.key, own);
      (spec.children ?? []).forEach(visit);
    };
    FEATURE_BLOCKS.forEach(b => b.menu.forEach(visit));

    expect(conflicts).toEqual([]);
  });

  it('every menu key is unique WITHIN a single block\'s own tree', () => {
    FEATURE_BLOCKS.forEach(block => {
      const keys: string[] = [];
      const visit = (s: MenuSpec): void => {
        keys.push(s.key);
        (s.children ?? []).forEach(visit);
      };
      block.menu.forEach(visit);
      expect(new Set(keys).size, `block '${block.id}' repeats a menu key`).toBe(keys.length);
    });
  });

  /**
   * The invariant the two tests above do NOT cover, and the blanket "unique across the
   * whole catalogue" test (that they replaced) used to: a key that is anyone's CHILD must
   * never ALSO be anyone's TOP-LEVEL spec — even with byte-identical own fields, even in a
   * different block (task 12 review round 3). `rootNavKeys()`
   * (`apps/functions/src/tenant/apply-feature-selection.ts`) only ever looks at a block's
   * TOP-LEVEL specs, never recursing into `children` — that is precisely why the
   * cms-menu/aoc-menu restructuring works (a child stays un-attached to the root nav no
   * matter how many blocks redeclare its parent). A key that is simultaneously someone's
   * child (rendered inside a submenu) and someone's top-level spec (appended straight to
   * `main_<tenantId>`) would render in BOTH places — the exact duplicate-root-nav defect
   * Finding 1 (fix round 2) existed to prevent, reopened through a gap the field-identity
   * check does not close (verified: temporarily adding `menu-all` as ALSO a top-level spec
   * of `category` — byte-identical own fields, already a `cms-menu` child in `cms` — passed
   * both existing tests above and was only caught once this test was added).
   */
  it('a key declared as anyone\'s child is never ALSO declared as anyone\'s top-level spec', () => {
    const childKeys = new Set<string>();
    const topLevelKeys = new Set<string>();

    const visitChildren = (s: MenuSpec): void => {
      (s.children ?? []).forEach(c => { childKeys.add(c.key); visitChildren(c); });
    };
    FEATURE_BLOCKS.forEach(b => b.menu.forEach(s => {
      topLevelKeys.add(s.key);
      visitChildren(s);
    }));

    const violations = [...topLevelKeys].filter(k => childKeys.has(k));
    expect(violations).toEqual([]);
  });
});
