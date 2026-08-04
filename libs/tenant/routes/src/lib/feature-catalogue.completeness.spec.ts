import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS, collectMenuUrls } from '@okr/tenant-util';
import type { MenuSpec } from '@okr/tenant-util';
import { NON_BLOCK_DOMAINS } from './feature-catalogue.non-blocks';

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
  /**
   * THE ASSERTION THIS TEST WAS ALWAYS MEANT TO MAKE. From task 6 to task 18 the `known` set
   * also folded in a temporary `PENDING_CLASSIFICATION` array, so the test only ever proved
   * "classified or explicitly deferred". Task 18 drained and DELETED that array, and this now
   * passes on its own merits: every `libs/<domain>/feature` domain is a catalogue block or a
   * listed non-block. Do not reintroduce an escape hatch to make a new domain pass — see the
   * note in `feature-catalogue.non-blocks.ts` for the two options.
   */
  it('every libs/*/feature domain is a block or an explicit non-block', () => {
    const known = new Set([
      ...FEATURE_BLOCKS.map(b => b.id),
      ...Object.keys(NON_BLOCK_DOMAINS),
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
   * Every `dependsOn` cycle, as readable paths (`a → b → c → a`). Empty for an acyclic graph.
   *
   * Three-colour DFS: 0 = unvisited, 1 = on the current stack (grey), 2 = fully explored
   * (black). Re-reaching a GREY node means the current stack has closed a loop, and the loop
   * is exactly the stack from that node onward — which is what makes the path reportable.
   * Re-reaching a BLACK node is just a diamond (two blocks sharing a dependency, e.g.
   * `calevent` and `relationship` both → `subject`), NOT a cycle: a plain "already visited"
   * check, like the one in `resolveWithDeps`, cannot tell those two cases apart, which is
   * precisely why that function terminates on a cycle instead of detecting one.
   *
   * A self-dependency (`x` listing `x`) is reported by the same mechanism, as `x → x`: `x` is
   * grey while its own `dependsOn` is being walked.
   *
   * An unknown id is skipped rather than throwing — a dangling target is a different defect
   * with its own test above, and this one should stay readable when both fail at once.
   */
  function dependsOnCycles(): string[] {
    const byId = new Map(FEATURE_BLOCKS.map(b => [b.id, b]));
    const colour = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const cycles = new Set<string>();

    const visit = (id: string): void => {
      const seen = colour.get(id) ?? 0;
      if (seen === 1) {
        cycles.add([...stack.slice(stack.indexOf(id)), id].join(' → '));
        return;
      }
      if (seen === 2) return;

      colour.set(id, 1);
      stack.push(id);
      (byId.get(id)?.dependsOn ?? []).forEach(visit);
      stack.pop();
      colour.set(id, 2);
    };

    FEATURE_BLOCKS.forEach(b => visit(b.id));
    return [...cycles];
  }

  /**
   * NOTHING ELSE CATCHES THIS (added task 17 fix round 4, before task 18 writes its edges).
   * `resolveWithDeps` (`feature-deps.util.ts`) guards recursion with a visited set, so a cycle
   * TERMINATES rather than hanging — `feature-deps.util.spec.ts` pins that termination — and
   * the "every dependsOn target exists" test above is satisfied by a cycle too, since both
   * ends of it are real block ids. So before this test, a cycle went completely undetected.
   *
   * It is a hard failure, not a warning, because the damage is silent and product-visible:
   *  - ENABLEMENT BECOMES MUTUAL. `resolveWithDeps` feeds the enablement selection, so
   *    `a → b → a` means no tenant can ever run `a` without `b` or `b` without `a`. Two
   *    separately-priced SKUs quietly fuse into one, and a bundle stops being switchable —
   *    the exact property this catalogue exists to provide.
   *  - THE PICKER STATES A FALSEHOOD. `@tenant/util.picker.dependents_confirm` ("X depends on
   *    this block and will also be disabled") is generated from this graph; on a cycle it
   *    describes a dependency direction that is not real.
   *
   * The live temptation this guards is concrete: `group-view.page.ts` embeds `CalEventList`,
   * `MembershipList` and `TaskList`, and `calevent`/`relationship` ALREADY declare
   * `dependsOn: ['subject', …]`. Adding the mirror-image edge to `subject` looks like the
   * consistent thing to do and would close a cycle. The correct move there is to catalogue the
   * embedded component's context wrapper on the block that owns it (or co-declare it), never to
   * draw the reverse edge. Task 18 settled each of the four cases — `document` and `task` got a
   * real edge (neither depends back on `subject`), `calevent`/`relationship` did not, `chat` got
   * a menu-doc co-declaration; the full reasoning is in `feature-catalogue.non-blocks.ts`.
   *
   * If a future design genuinely needs mutual dependencies, this test is the wrong answer and
   * the MODEL needs revisiting — do not soften the assertion to make a cycle pass.
   */
  it('the dependsOn graph over the real catalogue is acyclic', () => {
    expect(dependsOnCycles()).toEqual([]);
  });

  // Degenerate cycle of length one, called out separately so its failure message names the
  // defect instead of reading as a generic loop. `resolveWithDeps` swallows it completely: the
  // block is added to the accumulator before its own `dependsOn` is walked, so `x → x` is a
  // silent no-op at runtime and nothing else would ever surface it.
  it('no block depends on itself', () => {
    const selfDependent = FEATURE_BLOCKS.filter(b => b.dependsOn.includes(b.id)).map(b => b.id);
    expect(selfDependent).toEqual([]);
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

  /**
   * Originally a hard `Set.size === keys.length` uniqueness check — tightened (task 13,
   * verified against Firestore) to the SAME "same node everywhere" tolerance as the
   * cross-block test above, because a real live pattern violates plain uniqueness: the
   * `relationship` block's two live context-menu wrappers, `c-membership` (the `membership`
   * route's `:contextMenuName`, full admin list) and `c-groupmembers` (the `contact`
   * route's, the group/org-scoped view), legitimately share several leaf action docs —
   * `membership-add`, `membership-copyemail`, `membership-exportraw`,
   * `membership-exportaddresses` each exist as ONE real Firestore doc, referenced as a
   * child of BOTH wrapper docs (verified: `c-membership.menuItems` and
   * `c-groupmembers.menuItems` both list all four). That is the intra-block instance of
   * the exact same "shared node, redeclared verbatim" pattern the cross-block test already
   * tolerates (`cmsMenuParent`/`aocMenuParent`/`subjectsMenuParent`/`resourceMenuParent`) —
   * blanking one wrapper's children to force plain uniqueness would misrepresent the live
   * doc (the same defect class as blanking a `call` url, see `feature-routes.util.spec.ts`).
   * The real invariant — a key repeated ANYWHERE (same block or not) must always describe
   * the same node — is still fully enforced, just via the same "own fields identical"
   * comparison as the test above instead of a blanket ban on repetition.
   */
  it('every menu key that recurs within a single block\'s own tree describes the same node', () => {
    type OwnFields = Omit<MenuSpec, 'children'>;
    FEATURE_BLOCKS.forEach(block => {
      const seen = new Map<string, OwnFields>();
      const conflicts: string[] = [];
      const visit = (s: MenuSpec): void => {
        const { children: _children, ...own } = s;
        const prior = seen.get(s.key);
        if (prior && JSON.stringify(prior) !== JSON.stringify(own)) conflicts.push(s.key);
        seen.set(s.key, own);
        (s.children ?? []).forEach(visit);
      };
      block.menu.forEach(visit);
      expect(conflicts, `block '${block.id}' repeats a menu key with different fields`).toEqual([]);
    });
  });

  /**
   * Fix round 1 (review, task 13): the field-identity tests above check that a REPEATED key
   * always describes the same node, but say nothing about a key appearing TWICE as a
   * sibling under the exact same parent — byte-identical copies pass both tests (identical
   * "own fields" trivially match themselves) yet still corrupt the seeded doc. Reproduced
   * live before fixing: temporarily duplicated the `group-add` entry under `c-groups` in
   * `feature-blocks.ts` — all 10 existing tests (including both field-identity tests above)
   * stayed GREEN. The consequence is concrete in `menu-seed.util.ts`'s `planMenuOps`: the
   * create branch writes `menuItems: (spec.children ?? []).map(c => c.key)` with no dedup,
   * and the update branch's `missingChildren` filter only compares against the live doc's
   * existing `menuItems`, so a duplicate IN THE CATALOGUE sails through both paths — the
   * seeded `c-groups.menuItems` becomes `['group-add','group-add','group-export-raw']`, and
   * the action sheet renders "Gruppe hinzufügen" twice with nothing to ever prune it.
   */
  it('no parent repeats a sibling key among its own direct children', () => {
    const violations: string[] = [];
    const visit = (s: MenuSpec): void => {
      const siblings = (s.children ?? []).map(c => c.key);
      if (new Set(siblings).size !== siblings.length) violations.push(s.key);
      (s.children ?? []).forEach(visit);
    };
    FEATURE_BLOCKS.forEach(b => b.menu.forEach(visit));
    expect(violations, 'parent(s) with a duplicated sibling key').toEqual([]);
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

  /**
   * Fix round 1 (review, task 14, Important 4): mechanises convention rule 9 — "if a
   * `navigate` url ends in `/c-something`, that wrapper doc must be catalogued too" — which
   * nothing in the suite previously checked. That gap let a missing context wrapper land
   * clean THREE times (`c-prel`, task 13 fix round 1; the `aoc` children, task 12 review
   * round 2; and `c-calevents`, this task's own Critical 2 finding, present since task 5)
   * before being caught by manual review each time.
   *
   * Walks every `navigate` url `collectMenuUrls` returns, extracts any path segment that
   * starts with `c-`, and asserts it is a `key` somewhere in the catalogue's menu specs (at
   * any depth, in any block) — a context wrapper doesn't need to be a TOP-level spec (most
   * aren't reachable via a `navigate` url pointing directly at them; they're referenced only
   * as another route's `:contextMenuName` segment), so this checks presence anywhere in the
   * tree, not top-level presence.
   *
   * ALLOW-LIST, not a loose match: `c-address` is a real, already-documented exception — the
   * `subject` block's `addresses` entry points at `/address/c-address`, but NO live
   * `menuItems` doc named `c-address` exists anywhere (confirmed, task 13 fix round 1, by a
   * name-equality query — zero hits). Inventing it would violate the mirror-verbatim rule;
   * the gap is intentionally left live-data-accurate and flagged in the source comment on
   * `addresses` instead. Any future addition to this list must carry the same kind of
   * verified justification, not be added to silence a real gap.
   */
  it('every navigate url\'s c-* segment is a catalogued menu key (context-wrapper coverage)', () => {
    const ALLOWED_UNCATALOGUED_WRAPPERS = new Set<string>([
      // No live `menuItems/c-address` doc exists anywhere — see the comment on `addresses`
      // in the `subject` block (task 13 fix round 1). Not invented, per the mirror rule.
      'c-address',
    ]);

    const allKeys = new Set<string>();
    const visit = (s: MenuSpec): void => {
      allKeys.add(s.key);
      (s.children ?? []).forEach(visit);
    };
    FEATURE_BLOCKS.forEach(b => b.menu.forEach(visit));

    const missing = new Set<string>();
    collectMenuUrls(FEATURE_BLOCKS).forEach(url => {
      url.split('/').filter(Boolean).forEach(segment => {
        if (segment.startsWith('c-') && !allKeys.has(segment) && !ALLOWED_UNCATALOGUED_WRAPPERS.has(segment)) {
          missing.add(segment);
        }
      });
    });

    expect([...missing]).toEqual([]);
  });
});
