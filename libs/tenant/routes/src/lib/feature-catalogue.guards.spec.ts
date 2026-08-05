import { Injector, runInInjectionContext } from '@angular/core';
import { RedirectCommand, UrlTree, type ActivatedRouteSnapshot, type CanActivateFn, type Route, type RouterStateSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { isAdminGuard, isAuditorGuard, isAuthenticatedGuard, isContentAdminGuard } from '@okr/auth-feature';
import { AppStore } from '@okr/shared-feature';

import { FEATURE_ROUTES } from './feature-catalogue';

/**
 * THE SAFETY NET FOR THE 2026-08-05 RULINGS — R-5 (`isContentAdminGuard` on the five routes
 * whose menu docs say `contentAdmin`) and R-6 (the same swap on the seven where the route said
 * `privileged`, a deliberate ACCESS REDUCTION).
 *
 * Three properties are pinned here, each of which can be lost silently:
 *
 * 1. A contentAdmin reaches all twelve. A revert to `isPrivilegedGuard` looks harmless and
 *    re-breaks exactly the role the menu documents name.
 * 2. A privileged-only user reaches NONE of them. For the seven R-6 routes that is the
 *    reduction itself — the owner was offered a union guard that would have kept privileged
 *    access and chose the swap deliberately, so drift back is a reversal of a ruling, not a fix.
 * 3. No guard FACTORY is registered uncalled, anywhere in the catalogue. That is the bug that
 *    left twelve scs routes enforcing nothing.
 *
 * Assertions are BEHAVIOURAL, not by guard identity — `isAdminGuard()`/`isContentAdminGuard()`
 * mint a fresh closure per call, so there is nothing to compare by reference. The one exception
 * is property 3, which is an identity check precisely because behaviour cannot express it.
 */

/** The `/aoc` children ruled down to contentAdmin. Everything else under `/aoc` is admin-only. */
const AOC_CONTENT_ADMIN = ['tag', 'srv', 'website'] as const;

interface RuledRoute {
  menuDoc: string;
  blockId: string;
  path: string;
  child?: string;
}

/** R-5: route said `admin`, menu doc says `contentAdmin`. No one lost access. */
const RULED_R5: RuledRoute[] = [
  { menuDoc: 'templates', blockId: 'pdf-template', path: 'templates' },
  { menuDoc: 'forms-all', blockId: 'forms', path: 'forms' },
  { menuDoc: 'aoc-website', blockId: 'aoc', path: 'aoc', child: 'website' },
  { menuDoc: 'aoc-srv', blockId: 'aoc', path: 'aoc', child: 'srv' },
  { menuDoc: 'tag-all', blockId: 'aoc', path: 'aoc', child: 'tag' },
];

/**
 * R-6: route said `privileged`, menu doc says `contentAdmin`. `privileged` and `contentAdmin`
 * are DISJOINT apart from `admin` (`hasRole` maps each to `[<role>, 'admin']`), so unlike R-5
 * this swap takes access away from privileged-only users. That is the ruling, not a side effect.
 */
const REDUCED_R6: RuledRoute[] = [
  { menuDoc: 'menu-all', blockId: 'cms', path: 'menu', child: 'all' },
  { menuDoc: 'page-all', blockId: 'cms', path: 'page', child: ':listId/:contextMenuName' },
  { menuDoc: 'section-all', blockId: 'cms', path: 'section', child: 'all' },
  { menuDoc: 'category-all', blockId: 'category', path: 'category', child: ':listId/:contextMenuName' },
  { menuDoc: 'location-all', blockId: 'geo', path: 'location', child: ':listId/:contextMenuName' },
  { menuDoc: 'esign', blockId: 'esign', path: 'esign' },
  { menuDoc: 'document-all', blockId: 'document', path: 'document', child: ':listId/:contextMenuName' },
];

const ALL_RULED = [...RULED_R5, ...REDUCED_R6];

/** Roles is a flag map (`{ admin: true }`), not an array — see `checkAuthorization`. */
function injectorFor(roles: Record<string, boolean>): Injector {
  return Injector.create({
    providers: [{ provide: AppStore, useValue: { currentUser: () => ({ roles }) } }],
  });
}

const ADMIN = injectorFor({ admin: true });
const CONTENT_ADMIN = injectorFor({ contentAdmin: true });
const PRIVILEGED = injectorFor({ privileged: true });
const REGISTERED = injectorFor({ registered: true });

/**
 * Does the router ACTIVATE on this guard result? Modelled on Angular's own
 * `prioritizedGuardValue` (`@angular/router`'s `_router-chunk.mjs`), which reduces a route's
 * guard results with:
 *
 *   `if (result === true) continue; else if (result === false || isRedirect(result)) return result;`
 *   …and after the loop, `return true`.
 *
 * `isRedirect` is `isUrlTree(val) || val instanceof RedirectCommand`, so BOTH are modelled here.
 * No guard in this catalogue returns a `RedirectCommand` today — it is included because the
 * cost of it being absent is a test that silently reads a redirect as "allow", which is exactly
 * the failure this function exists to prevent.
 *
 * So ONLY `false` and a redirect block navigation. Anything else — notably the inner function
 * returned by a guard FACTORY someone forgot to call — matches no branch and the router
 * activates the route.
 *
 * ⚠️ Deliberately NOT `result === true`. An earlier version of this spec used that, which made
 * an uncalled factory read as "blocked" while the real router reads it as "allow everyone" — a
 * test whose failure mode is the inverse of production is worse than no test, and this exact
 * confusion is how twelve uncalled guards survived in `app.routes.ts`.
 */
function routerActivates(result: unknown): boolean {
  if (result === false) return false;
  if (result instanceof UrlTree) return false;
  if (result instanceof RedirectCommand) return false;
  return true;
}

/**
 * `isAuthenticatedGuard` is the only non-role guard these chains contain. It injects `AUTH`/
 * `Router` and answers over Firebase auth state, which this harness has no business standing
 * up — and every persona here is a signed-in user, so it is never the discriminator.
 *
 * It is skipped by IDENTITY, not by catching what it throws. Catching used to be how this
 * worked, and it meant ANY guard that started throwing — say a role guard after a DI refactor —
 * silently read as "allows" in every persona test, turning this whole file green for the worst
 * possible reason. Identity is stable here because `isAuthenticatedGuard` is a plain
 * `CanActivateFn` registered uncalled, not a factory.
 */
const NON_ROLE_GUARDS: ReadonlySet<CanActivateFn> = new Set([isAuthenticatedGuard]);

/**
 * Runs a route's whole ancestor→self guard chain the way the router would: every guard must
 * allow. A guard that throws fails the suite, loudly, naming itself.
 *
 * The feature gate composed by `composeGatedFeatureRoutes` is not part of the chain: that is a
 * per-tenant packaging question and `compose-gated-routes.spec.ts` owns it.
 */
function activates(injector: Injector, ...chain: Route[]): boolean {
  const guards = chain.flatMap(route => (route.canActivate ?? []) as CanActivateFn[]);
  expect(guards.length, 'route chain has no guard at all').toBeGreaterThan(0);
  return guards.every(guard => {
    if (NON_ROLE_GUARDS.has(guard)) return true;
    let result: unknown;
    try {
      result = runInInjectionContext(injector, () =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    } catch (err) {
      throw new Error(`role guard threw instead of deciding — a "passing" test here would be a lie: ${String(err)}`);
    }
    return routerActivates(result);
  });
}

function fragmentOf(blockId: string, path: string): Route {
  const block = FEATURE_ROUTES.find(b => b.id === blockId);
  expect(block, `no FEATURE_ROUTES entry '${blockId}'`).toBeDefined();
  const hit = block?.routes().find(r => r.path === path);
  expect(hit, `block '${blockId}' owns no top-level fragment '${path}'`).toBeDefined();
  return hit as Route;
}

function childOf(parent: Route, path: string, label: string): Route {
  const child = (parent.children ?? []).find(c => c.path === path);
  expect(child, `${label} has no child '${path}'`).toBeDefined();
  return child as Route;
}

/** The full guard chain of a ruled route, ancestors included. */
function chainOf(entry: RuledRoute): Route[] {
  const parent = fragmentOf(entry.blockId, entry.path);
  return entry.child ? [parent, childOf(parent, entry.child, `/${entry.path}`)] : [parent];
}

const blockedFor = (injector: Injector, routes: RuledRoute[]): string[] =>
  routes.filter(entry => !activates(injector, ...chainOf(entry))).map(entry => entry.menuDoc);

const reachableFor = (injector: Injector, routes: RuledRoute[]): string[] =>
  routes.filter(entry => activates(injector, ...chainOf(entry))).map(entry => entry.menuDoc);

describe('the twelve routes ruled to match their menu documents', () => {
  it('covers every route the two rulings name', () => {
    expect(RULED_R5).toHaveLength(5);
    expect(REDUCED_R6).toHaveLength(7);
  });

  /**
   * THE RULINGS THEMSELVES, and the assertion that fails on a revert to `isPrivilegedGuard` —
   * `hasRole('privileged')` → `['privileged', 'admin']` never admitted `contentAdmin`, the very
   * role all twelve menu documents name.
   */
  it('a contentAdmin reaches all twelve', () => {
    expect(blockedFor(CONTENT_ADMIN, ALL_RULED),
      'menu row visible, navigation still cancelled — a ruling is not in effect').toEqual([]);
  });

  it('an admin reaches all twelve too (softening never locks admins out)', () => {
    expect(blockedFor(ADMIN, ALL_RULED)).toEqual([]);
  });

  /**
   * THE R-6 REDUCTION, pinned. These seven were reachable by a privileged-only user before
   * 2026-08-05 and deliberately are not any more. If this list stops being empty, someone has
   * reversed a ruling — the owner declined the union guard that would have kept both roles.
   */
  it('a privileged-only user is BLOCKED from the seven R-6 routes (the deliberate reduction)', () => {
    expect(reachableFor(PRIVILEGED, REDUCED_R6),
      'privileged access came back — R-6 chose the straight swap over a union guard').toEqual([]);
  });

  it('a privileged-only user reaches none of the twelve', () => {
    expect(reachableFor(PRIVILEGED, ALL_RULED)).toEqual([]);
  });

  it('a merely-registered member reaches none of the twelve', () => {
    expect(reachableFor(REGISTERED, ALL_RULED)).toEqual([]);
  });
});

/**
 * THE UNCALLED-FACTORY DETECTOR, catalogue-wide. `isAdminGuard`, `isAuditorGuard` and
 * `isContentAdminGuard` are `(): CanActivateFn` factories: registered UNCALLED, Angular invokes
 * the factory as the guard, gets a function back, and `prioritizedGuardValue` activates the
 * route — the guard enforces nothing while looking exactly like a guard. Twelve routes in
 * `app.routes.ts` are in that state today.
 *
 * Behaviour cannot express this (an uncalled factory "allows", which is indistinguishable from
 * a guard that passed), so this is the one identity assertion in the file.
 */
describe('guard factories are never registered uncalled', () => {
  it('no fragment or child anywhere in the catalogue references a factory itself', () => {
    const factories = new Map<unknown, string>([
      [isAdminGuard, 'isAdminGuard'],
      [isAuditorGuard, 'isAuditorGuard'],
      [isContentAdminGuard, 'isContentAdminGuard'],
    ]);
    const defects: string[] = [];

    const walk = (blockId: string, routes: Route[], trail: string): void => {
      routes.forEach(route => {
        const here = `${trail}/${route.path ?? ''}`;
        (route.canActivate ?? []).forEach(guard => {
          const name = factories.get(guard);
          if (name) defects.push(`${blockId} ${here}: ${name} written uncalled`);
        });
        walk(blockId, route.children ?? [], here);
      });
    };
    FEATURE_ROUTES.forEach(block => walk(block.id, block.routes(), ''));

    expect(defects).toEqual([]);
  });
});

describe('/aoc guards after the 2026-08-05 rulings', () => {
  /**
   * The floor is no longer `admin`, so "the parent will catch it" is no longer true. Every
   * child must state its own requirement — this is what makes the next test meaningful.
   */
  it('every /aoc child carries its own guard', () => {
    const { children = [] } = fragmentOf('aoc', 'aoc');
    const unguarded = children.filter(c => (c.canActivate ?? []).length === 0).map(c => c.path);

    expect(unguarded, 'child would silently inherit the contentAdmin floor').toEqual([]);
    expect(children.length, 'children were added or removed; re-check the ruling list').toBe(16);
  });

  it('every child the rulings do NOT name stays admin-only', () => {
    const { children = [] } = fragmentOf('aoc', 'aoc');
    const others = children.filter(c => !AOC_CONTENT_ADMIN.includes(c.path as typeof AOC_CONTENT_ADMIN[number]));

    expect(others.length, 'expected thirteen admin-only /aoc children').toBe(13);
    // The child's OWN guard must reject both non-admin roles, independently of the floor.
    expect(others.filter(c => activates(CONTENT_ADMIN, c)).map(c => c.path)).toEqual([]);
    expect(others.filter(c => activates(PRIVILEGED, c)).map(c => c.path)).toEqual([]);
  });

  it('an admin still reaches every /aoc screen', () => {
    const parent = fragmentOf('aoc', 'aoc');
    const blocked = (parent.children ?? []).filter(c => !activates(ADMIN, parent, c)).map(c => c.path);

    expect(blocked).toEqual([]);
  });

  it('the /aoc floor still keeps a merely-registered user out of everything', () => {
    const parent = fragmentOf('aoc', 'aoc');
    const reachable = (parent.children ?? []).filter(c => activates(REGISTERED, parent, c)).map(c => c.path);

    expect(reachable).toEqual([]);
  });

  /**
   * The floor must not be the thing that decides: a contentAdmin has to clear the PARENT (so
   * the three ruled children are reachable) and still be stopped by each admin-only child. Both
   * halves in one assertion, because getting either wrong reintroduces the defeat-by-ancestor
   * bug the restructuring exists to avoid. R-6 touched no `/aoc` route, so the floor is still
   * the union of these children: thirteen `['admin']` ∪ three `['contentAdmin', 'admin']`.
   */
  it('a contentAdmin clears the floor but only reaches the three ruled screens', () => {
    const parent = fragmentOf('aoc', 'aoc');
    const reachable = (parent.children ?? [])
      .filter(c => activates(CONTENT_ADMIN, parent, c))
      .map(c => c.path as string);

    expect(reachable.sort()).toEqual([...AOC_CONTENT_ADMIN].sort());
  });
});
